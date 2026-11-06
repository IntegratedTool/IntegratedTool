/**
 * MOCK SERVICES: PROTOTYPE ONLY.
 * Nothing here authenticates a real user or sends a real email. Accounts and passwords live in memory only.
 * Failure counters/locks persist in localStorage (see mockState.ts) so they survive a refresh; the real
 * backend must enforce all of them server-side. Selected only when VITE_USE_MOCK is not "false".
 */
import { siteConfig } from '../config/site';
import { CAPTCHA_ALPHABET, GSTIN_RE, TIN_RE, maskEmail, normaliseGstin, normaliseTin } from '../utils/validation';
import { clearSession, startSession } from './mockSession';
import { getState, persist, resetMockState } from './mockState';
import { sampleAnnouncements } from './sampleAnnouncements';
import {
  ApiError,
  type AuthApi,
  type AuthResult,
  type CaptchaChallenge,
  type OtpChallenge,
  type PasswordLoginInput,
  type RegistrationInput,
  type UserKind,
} from './types';

const isTest = import.meta.env.MODE === 'test';
const delay = (ms = 500) => (isTest ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

/** Demo data for reviewers: documented in the README, never shown on the page. */
export const DEMO = {
  otp: '123456',
  admin: { email: 'admin.demo@tn.gov.in', password: 'Demo@Admin12' },
  officer: { gpf: '0012345', password: 'Demo@Officer1', email: 'officer.demo@tn.gov.in', name: 'Demo Officer' },
  registered: { email: 'user.demo@example.com', password: 'Demo@User123', name: 'Demo User' },
  gstin: '33ABCDE1234F1Z7',
  tin: '33123456789',
  dealerEmail: 'dealer.demo@example.com',
  gstinNoEmail: '33ZZZZZ9999Z1ZF',
};

export const OTP_VALIDITY_S = 120;
export const OTP_RESEND_S = 60;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_MAX_RESENDS = 3;
export const OTP_LOCK_S = 20 * 60;
export const OFFICER_MAX_FAILS = 3;
const CAPTCHA_TTL_S = 120;

const districts = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode',
  'Kallakurichi', 'Kancheepuram', 'Kanniyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem',
  'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur',
  'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar',
];

interface Account {
  password: string;
  name: string;
  mobile?: string;
}
const registered = new Map<string, Account>();
const seed = () => {
  registered.clear();
  registered.set(DEMO.registered.email, { password: DEMO.registered.password, name: DEMO.registered.name, mobile: '9876500001' });
};
seed();

const rnd = (n: number) => Math.floor(Math.random() * n);
const uid = () => Math.random().toString(36).slice(2, 12);

/* ---------------- CAPTCHA ---------------- */
const captchas = new Map<string, { answer: string; expiresAt: number }>();

function captchaSvg(text: string): string {
  const chars = [...text]
    .map((c, i) => {
      const x = 10 + i * 26;
      const y = 32 + rnd(6) - 3;
      const rot = rnd(30) - 15;
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Verdana,sans-serif" font-size="24" font-weight="700" fill="#1f3a5f">${c}</text>`;
    })
    .join('');
  const lines = Array.from({ length: 5 })
    .map(
      () =>
        `<line x1="${rnd(170)}" y1="${rnd(44)}" x2="${rnd(170)}" y2="${rnd(44)}" stroke="#7a8ca5" stroke-width="1.2" opacity=".6"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="44" viewBox="0 0 170 44"><rect width="170" height="44" fill="#eef3f9"/>${lines}${chars}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeCaptcha(): CaptchaChallenge {
  const answer = Array.from({ length: 6 }, () => CAPTCHA_ALPHABET[rnd(CAPTCHA_ALPHABET.length)]).join('');
  const id = `cap-${uid()}`;
  captchas.set(id, { answer, expiresAt: Date.now() + CAPTCHA_TTL_S * 1000 });
  return { id, imageUrl: captchaSvg(answer), expiresInSeconds: CAPTCHA_TTL_S };
}

/** Test hook only. */
export const peekCaptchaAnswer = (id: string) => captchas.get(id)?.answer;

function checkCaptcha(c: PasswordLoginInput['captcha']): void {
  if (!c || !c.value) throw new ApiError('CAPTCHA_MISSING', { captchaRequired: 1 });
  const rec = captchas.get(c.id);
  captchas.delete(c.id); // single use
  if (!rec || Date.now() > rec.expiresAt) throw new ApiError('CAPTCHA_EXPIRED', { captchaRequired: 1 });
  if (rec.answer !== c.value.trim().toUpperCase()) throw new ApiError('CAPTCHA_INCORRECT', { captchaRequired: 1 });
}

/* ---------------- Password login with conditional CAPTCHA ---------------- */
function passwordLogin(
  kind: UserKind,
  input: PasswordLoginInput,
  verify: (id: string, pw: string) => AuthResult | null,
  officerKnown = false,
): AuthResult {
  const state = getState();
  const id = input.identifier.trim().toLowerCase();
  const key = `${kind}:${id}`;
  if (kind === 'officer' && state.blocked[key]) throw new ApiError('ACCOUNT_BLOCKED');

  const fails = state.credFails[key] ?? 0;
  if (fails >= 1) checkCaptcha(input.captcha); // wrong CAPTCHA never counts as a credential failure

  const ok = verify(id, input.password);
  if (ok) {
    delete state.credFails[key];
    persist();
    return ok;
  }
  state.credFails[key] = fails + 1;
  // Only a real GPF number can be blocked, so unknown IDs never reveal that they are known or unknown.
  if (kind === 'officer' && officerKnown && state.credFails[key] >= OFFICER_MAX_FAILS) {
    state.blocked[key] = true;
    persist();
    throw new ApiError('ACCOUNT_BLOCKED');
  }
  persist();
  throw new ApiError('INVALID_CREDENTIALS', { captchaRequired: 1 });
}

/* ---------------- OTP engine ---------------- */
type Purpose = 'officer-unblock' | 'dealer' | 'register' | 'reset';
interface Challenge {
  purpose: Purpose;
  guardKey: string;
  email: string;
  expiresAt: number;
  resendAt: number;
  resends: number;
  payload?: unknown;
}
const challenges = new Map<string, Challenge>();

function assertNotLocked(guardKey: string) {
  const g = getState().otpGuards[guardKey];
  if (!g) return;
  if (g.lockUntil > Date.now()) {
    throw new ApiError('OTP_LOCKED', { waitSeconds: Math.ceil((g.lockUntil - Date.now()) / 1000) });
  }
  if (g.lockUntil) {
    delete getState().otpGuards[guardKey]; // lock served
    persist();
  }
}

function issue(purpose: Purpose, guardKey: string, email: string, payload?: unknown, replaceId?: string, resends = 0): OtpChallenge {
  assertNotLocked(guardKey);
  if (replaceId) challenges.delete(replaceId); // previous OTP is invalidated
  const challengeId = `otp-${uid()}`;
  const now = Date.now();
  challenges.set(challengeId, {
    purpose,
    guardKey,
    email,
    expiresAt: now + OTP_VALIDITY_S * 1000,
    resendAt: now + OTP_RESEND_S * 1000,
    resends,
    payload,
  });
  return {
    challengeId,
    maskedEmail: maskEmail(email),
    validitySeconds: OTP_VALIDITY_S,
    resendAfterSeconds: OTP_RESEND_S,
    maxAttempts: OTP_MAX_ATTEMPTS,
    resendsLeft: OTP_MAX_RESENDS - resends,
  };
}

function consume(challengeId: string, otp: string, purpose: Purpose): Challenge {
  const ch = challenges.get(challengeId);
  if (!ch || ch.purpose !== purpose) throw new ApiError('OTP_EXPIRED');
  assertNotLocked(ch.guardKey);
  if (Date.now() > ch.expiresAt) throw new ApiError('OTP_EXPIRED');
  const state = getState();
  if (otp !== DEMO.otp) {
    const g = (state.otpGuards[ch.guardKey] ??= { fails: 0, lockUntil: 0 });
    g.fails += 1;
    if (g.fails >= OTP_MAX_ATTEMPTS) {
      g.lockUntil = Date.now() + OTP_LOCK_S * 1000;
      persist();
      throw new ApiError('OTP_LOCKED', { waitSeconds: OTP_LOCK_S });
    }
    persist();
    throw new ApiError('OTP_INVALID', { left: OTP_MAX_ATTEMPTS - g.fails });
  }
  delete state.otpGuards[ch.guardKey];
  persist();
  challenges.delete(challengeId);
  return ch;
}

const lookups = new Map<string, { email: string; id: string }>();
const resetTokens = new Map<string, string>();

export const mockApi: AuthApi = {
  async logout() {
    await delay(100);
    clearSession();
  },

  async captchaNew() {
    await delay(200);
    return makeCaptcha();
  },

  async captchaAudio(id) {
    await delay(100);
    const rec = captchas.get(id);
    if (!rec) throw new ApiError('CAPTCHA_EXPIRED');
    // PROTOTYPE: production returns an audio file generated on the server. The mock lets the browser speak it.
    return { speakText: [...rec.answer].join(' ') };
  },

  async adminLogin(input) {
    await delay();
    return passwordLogin('admin', input, (id, pw) =>
      (id === DEMO.admin.email || id === siteConfig.adminUsername.toLowerCase()) && pw === DEMO.admin.password
        ? startSession('admin', 'admin-helpdesk', 'Admin Helpdesk', { name: 'Admin Helpdesk', email: DEMO.admin.email })
        : null,
    );
  },

  async officerLogin(input) {
    await delay();
    const known = input.identifier.trim() === DEMO.officer.gpf;
    return passwordLogin(
      'officer',
      input,
      (id, pw) =>
        id === DEMO.officer.gpf && pw === DEMO.officer.password
          ? startSession('officer', 'officer-0012345', DEMO.officer.name, { name: DEMO.officer.name, email: DEMO.officer.email })
          : null,
      known,
    );
  },

  async registeredLogin(input) {
    await delay();
    return passwordLogin('registered', input, (id, pw) => {
      const a = registered.get(id);
      return a && a.password === pw ? startSession('registered', `reg:${id}`, a.name, { name: a.name, email: id, mobile: a.mobile }) : null;
    });
  },

  async officerSendUnblockOtp(gpf) {
    await delay();
    const id = gpf.trim();
    if (id !== DEMO.officer.gpf) throw new ApiError('INVALID_CREDENTIALS');
    return issue('officer-unblock', `unblock:${id}`, DEMO.officer.email, id);
  },

  async officerUnblockVerify(challengeId, otp) {
    await delay();
    const ch = consume(challengeId, otp, 'officer-unblock');
    const state = getState();
    const key = `officer:${String(ch.payload).toLowerCase()}`;
    delete state.blocked[key];
    delete state.credFails[key];
    persist();
    // Deliberately no session: the officer must still sign in with the password.
  },

  async dealerLookup(kind, identifier) {
    await delay();
    const id = kind === 'gst' ? normaliseGstin(identifier) : normaliseTin(identifier);
    if (kind === 'gst' ? !GSTIN_RE.test(id) : !TIN_RE.test(id)) throw new ApiError(kind === 'gst' ? 'NO_ACTIVE_GSTIN' : 'NO_ACTIVE_TIN');
    if (id === DEMO.gstinNoEmail) throw new ApiError('NO_REGISTERED_EMAIL');
    if (id !== DEMO.gstin && id !== DEMO.tin) throw new ApiError(kind === 'gst' ? 'NO_ACTIVE_GSTIN' : 'NO_ACTIVE_TIN');
    const lookupId = `lk-${uid()}`;
    lookups.set(lookupId, { email: DEMO.dealerEmail, id });
    return { lookupId, maskedEmail: maskEmail(DEMO.dealerEmail) };
  },

  async dealerSendOtp(lookupId) {
    await delay();
    const lk = lookups.get(lookupId);
    if (!lk) throw new ApiError('OTP_EXPIRED');
    return issue('dealer', `dealer:${lk.id}`, lk.email, lk.id);
  },

  async dealerVerify(challengeId, otp) {
    await delay();
    const ch = consume(challengeId, otp, 'dealer');
    // The dealer's contact email is never sent to the browser in full, so nothing is prefilled from it.
    return startSession('dealer', `dealer:${String(ch.payload)}`, 'Demo Dealer', { name: 'Demo Dealer' });
  },

  async registrationSendOtp(input: RegistrationInput) {
    await delay();
    const email = input.email.trim().toLowerCase();
    if (registered.has(email)) throw new ApiError('EMAIL_EXISTS');
    return issue('register', `register:${email}`, email, { ...input, email });
  },

  async registrationVerify(challengeId, otp) {
    await delay();
    const ch = consume(challengeId, otp, 'register');
    const p = ch.payload as RegistrationInput;
    registered.set(p.email.toLowerCase(), { password: p.password, name: p.name, mobile: p.mobile });
  },

  async resetSendOtp(email) {
    await delay();
    const e = email.trim().toLowerCase();
    if (!registered.has(e)) throw new ApiError('NO_REGISTERED_EMAIL');
    return issue('reset', `reset:${e}`, e, e);
  },

  async resetVerify(challengeId, otp) {
    await delay();
    const ch = consume(challengeId, otp, 'reset');
    const token = `rt-${uid()}`;
    resetTokens.set(token, String(ch.payload));
    return { resetToken: token };
  },

  async resetPassword(resetToken, newPassword) {
    await delay();
    const email = resetTokens.get(resetToken);
    const acc = email ? registered.get(email) : undefined;
    if (!email || !acc) throw new ApiError('OTP_EXPIRED');
    acc.password = newPassword;
    resetTokens.delete(resetToken);
    const state = getState();
    delete state.credFails[`registered:${email}`];
    persist();
  },

  async otpResend(challengeId) {
    await delay();
    const ch = challenges.get(challengeId);
    if (!ch) throw new ApiError('OTP_EXPIRED');
    assertNotLocked(ch.guardKey);
    if (ch.resends >= OTP_MAX_RESENDS) throw new ApiError('OTP_RESEND_LIMIT');
    if (Date.now() < ch.resendAt) throw new ApiError('OTP_RESEND_WAIT');
    // The failed-attempt counter lives in the guard, so resending does not reset it.
    return issue(ch.purpose, ch.guardKey, ch.email, ch.payload, challengeId, ch.resends + 1);
  },

  async getDistricts() {
    await delay(150);
    return districts;
  },

  async getPublicAnnouncements() {
    await delay(300);
    return sampleAnnouncements;
  },
};

/** Test hook only. */
export function resetMock() {
  resetMockState();
  clearSession();
  captchas.clear();
  challenges.clear();
  lookups.clear();
  resetTokens.clear();
  seed();
}
