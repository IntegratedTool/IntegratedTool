import { randomBytes } from 'node:crypto';
import { maskEmail } from '../../../src/utils/validation.js';
import { ApiError, type OtpChallenge } from '../../../src/services/types.js';

export const OTP_LOCK_S = 20 * 60;

/** Limits come from the Super Admin console (settings); the app refreshes them before every OTP call. */
const limits = { validity: 120, resendWait: 60, maxAttempts: 3, maxResends: 3 };
export function setOtpLimits(l: Partial<typeof limits>) {
  Object.assign(limits, l);
}

interface Challenge {
  purpose: string;
  guardKey: string;
  email: string;
  expiresAt: number;
  resendAt: number;
  resends: number;
  payload: unknown;
}
const challenges = new Map<string, Challenge>();
const guards = new Map<string, { fails: number; lockUntil: number }>();
const uid = () => randomBytes(9).toString('hex');

function assertNotLocked(key: string) {
  const g = guards.get(key);
  if (!g) return;
  if (g.lockUntil > Date.now()) throw new ApiError('OTP_LOCKED', { waitSeconds: Math.ceil((g.lockUntil - Date.now()) / 1000) });
  if (g.lockUntil) guards.delete(key);
}

/**
 * Issues an OTP challenge. SAMPLE MODE: no email is sent; the configured sample OTP is the only accepted value.
 * Production: generate a random OTP here, store only its hash, and send it through the department's mail/SMS gateway.
 */
export function issueOtp(purpose: string, guardKey: string, email: string, payload: unknown, replaceId?: string, resends = 0): OtpChallenge {
  assertNotLocked(guardKey);
  if (replaceId) challenges.delete(replaceId);
  const challengeId = `otp-${uid()}`;
  const now = Date.now();
  challenges.set(challengeId, { purpose, guardKey, email, expiresAt: now + limits.validity * 1000, resendAt: now + limits.resendWait * 1000, resends, payload });
  return {
    challengeId, maskedEmail: maskEmail(email), validitySeconds: limits.validity, resendAfterSeconds: limits.resendWait,
    maxAttempts: limits.maxAttempts, resendsLeft: Math.max(0, limits.maxResends - resends),
  };
}

export function consumeOtp(challengeId: string, otp: string, purpose: string, expected: string): { payload: unknown } {
  const ch = challenges.get(challengeId);
  if (!ch || ch.purpose !== purpose) throw new ApiError('OTP_EXPIRED');
  assertNotLocked(ch.guardKey);
  if (Date.now() > ch.expiresAt) throw new ApiError('OTP_EXPIRED');
  if (otp !== expected) {
    const g = guards.get(ch.guardKey) ?? { fails: 0, lockUntil: 0 };
    guards.set(ch.guardKey, g);
    g.fails += 1;
    if (g.fails >= limits.maxAttempts) {
      g.lockUntil = Date.now() + OTP_LOCK_S * 1000;
      throw new ApiError('OTP_LOCKED', { waitSeconds: OTP_LOCK_S });
    }
    throw new ApiError('OTP_INVALID', { left: limits.maxAttempts - g.fails });
  }
  guards.delete(ch.guardKey);
  challenges.delete(challengeId);
  return { payload: ch.payload };
}

export function resendOtp(challengeId: string): OtpChallenge {
  const ch = challenges.get(challengeId);
  if (!ch) throw new ApiError('OTP_EXPIRED');
  assertNotLocked(ch.guardKey);
  if (ch.resends >= limits.maxResends) throw new ApiError('OTP_RESEND_LIMIT');
  if (Date.now() < ch.resendAt) throw new ApiError('OTP_RESEND_WAIT');
  // The failed-attempt counter lives in the guard, so resending does not reset it.
  return issueOtp(ch.purpose, ch.guardKey, ch.email, ch.payload, challengeId, ch.resends + 1);
}

export function resetOtpState() {
  challenges.clear();
  guards.clear();
}
