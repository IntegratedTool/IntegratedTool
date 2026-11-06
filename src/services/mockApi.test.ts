import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './types';
import { DEMO, OTP_LOCK_S, OTP_RESEND_S, mockApi as api, peekCaptchaAnswer, resetMock } from './mockApi';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ApiError ? { code: e.code, meta: e.meta as Record<string, number | string> } : { code: 'OTHER', meta: {} as Record<string, number | string> };
  }
  return null;
};
const solve = async () => {
  const c = await api.captchaNew();
  return { id: c.id, value: peekCaptchaAnswer(c.id)! };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  resetMock();
});
afterEach(() => vi.useRealTimers());

describe('CAPTCHA after first failure', () => {
  it('first wrong attempt needs no CAPTCHA and demands it next', async () => {
    const bad = { identifier: DEMO.admin.email, password: 'wrong' };
    const r1 = await code(api.adminLogin(bad));
    expect(r1?.code).toBe('INVALID_CREDENTIALS');
    expect(r1?.meta.captchaRequired).toBe(1);
    expect((await code(api.adminLogin(bad)))?.code).toBe('CAPTCHA_MISSING');
  });
  it('CAPTCHA is checked before the password and does not count as a wrong password', async () => {
    const id = DEMO.officer.gpf;
    await code(api.officerLogin({ identifier: id, password: 'x' })); // fail 1
    for (let i = 0; i < 5; i++) {
      const c = await api.captchaNew();
      expect((await code(api.officerLogin({ identifier: id, password: DEMO.officer.password, captcha: { id: c.id, value: 'AAAAAA' } })))?.code).toBe('CAPTCHA_INCORRECT');
    }
    const ok = await api.officerLogin({ identifier: id, password: DEMO.officer.password, captcha: await solve() });
    expect(ok.userType).toBe('officer');
  });
  it('captcha is single use and expires after 2 minutes', async () => {
    await code(api.adminLogin({ identifier: DEMO.admin.email, password: 'x' }));
    const cap = await solve();
    const good = { identifier: DEMO.admin.email, password: DEMO.admin.password };
    expect((await code(api.adminLogin({ ...good, password: 'bad', captcha: cap })))?.code).toBe('INVALID_CREDENTIALS');
    expect((await code(api.adminLogin({ ...good, captcha: cap })))?.code).toBe('CAPTCHA_EXPIRED'); // single use
    const c2 = await solve();
    vi.setSystemTime(Date.now() + 121_000);
    expect((await code(api.adminLogin({ ...good, captcha: c2 })))?.code).toBe('CAPTCHA_EXPIRED');
  });
  it('counter survives a "refresh" (state is read from storage layer, not the form)', async () => {
    await code(api.registeredLogin({ identifier: DEMO.registered.email, password: 'x' }));
    expect((await code(api.registeredLogin({ identifier: DEMO.registered.email, password: DEMO.registered.password })))?.code).toBe('CAPTCHA_MISSING');
  });
});

describe('officer blocking', () => {
  const bad = async () => {
    const e = await code(api.officerLogin({ identifier: DEMO.officer.gpf, password: 'bad', captcha: await solve() }));
    return e?.code;
  };
  it('blocks after three consecutive wrong passwords, unblock via OTP does not log in', async () => {
    expect(await code(api.officerLogin({ identifier: DEMO.officer.gpf, password: 'bad' }))).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await bad()).toBe('INVALID_CREDENTIALS');
    expect(await bad()).toBe('ACCOUNT_BLOCKED');
    expect((await code(api.officerLogin({ identifier: DEMO.officer.gpf, password: DEMO.officer.password })))?.code).toBe('ACCOUNT_BLOCKED');
    const ch = await api.officerSendUnblockOtp(DEMO.officer.gpf);
    expect(ch.maskedEmail).not.toContain('officer.demo');
    await api.officerUnblockVerify(ch.challengeId, DEMO.otp);
    // still has to log in normally, and the CAPTCHA requirement was reset
    expect((await api.officerLogin({ identifier: DEMO.officer.gpf, password: DEMO.officer.password })).userType).toBe('officer');
  });
  it('unknown GPF is never blocked', async () => {
    for (let i = 0; i < 6; i++) {
      const e = await code(api.officerLogin({ identifier: '9999999', password: 'x', captcha: i ? await solve() : undefined }));
      expect(e?.code).toBe('INVALID_CREDENTIALS');
    }
    expect((await code(api.officerSendUnblockOtp('9999999')))?.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('OTP rules', () => {
  const start = () => api.officerSendUnblockOtp(DEMO.officer.gpf);
  it('three wrong attempts lock for 20 minutes, even with a fresh send', async () => {
    const ch = await start();
    for (let i = 1; i <= 2; i++) expect(await code(api.officerUnblockVerify(ch.challengeId, '000000'))).toMatchObject({ code: 'OTP_INVALID', meta: { left: 3 - i } });
    expect((await code(api.officerUnblockVerify(ch.challengeId, '000000')))?.code).toBe('OTP_LOCKED');
    expect((await code(api.officerUnblockVerify(ch.challengeId, DEMO.otp)))?.code).toBe('OTP_LOCKED');
    expect((await code(start()))?.code).toBe('OTP_LOCKED');
    vi.setSystemTime(Date.now() + (OTP_LOCK_S + 1) * 1000);
    const again = await start();
    await expect(api.officerUnblockVerify(again.challengeId, DEMO.otp)).resolves.toBeUndefined();
  });
  it('resend waits 60s, invalidates the old OTP and keeps the failure count', async () => {
    const ch = await start();
    await code(api.officerUnblockVerify(ch.challengeId, '111111'));
    expect((await code(api.otpResend(ch.challengeId)))?.code).toBe('OTP_RESEND_WAIT');
    vi.setSystemTime(Date.now() + (OTP_RESEND_S + 1) * 1000);
    const next = await api.otpResend(ch.challengeId);
    expect((await code(api.officerUnblockVerify(ch.challengeId, DEMO.otp)))?.code).toBe('OTP_EXPIRED');
    expect(await code(api.officerUnblockVerify(next.challengeId, '222222'))).toMatchObject({ code: 'OTP_INVALID', meta: { left: 1 } });
  });
  it('allows at most three resends', async () => {
    let ch = await start();
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(Date.now() + (OTP_RESEND_S + 1) * 1000);
      ch = await api.otpResend(ch.challengeId);
    }
    expect(ch.resendsLeft).toBe(0);
    vi.setSystemTime(Date.now() + (OTP_RESEND_S + 1) * 1000);
    expect((await code(api.otpResend(ch.challengeId)))?.code).toBe('OTP_RESEND_LIMIT');
  });
  it('expires after 2 minutes without clearing failures; success is single use', async () => {
    const ch = await start();
    await code(api.officerUnblockVerify(ch.challengeId, '111111'));
    vi.setSystemTime(Date.now() + 121_000);
    expect((await code(api.officerUnblockVerify(ch.challengeId, DEMO.otp)))?.code).toBe('OTP_EXPIRED');
    const fresh = await start();
    expect(await code(api.officerUnblockVerify(fresh.challengeId, '333333'))).toMatchObject({ meta: { left: 1 } });
    await api.officerUnblockVerify(fresh.challengeId, DEMO.otp);
    expect((await code(api.officerUnblockVerify(fresh.challengeId, DEMO.otp)))?.code).toBe('OTP_EXPIRED');
  });
});

describe('dealer, registration and reset', () => {
  it('dealer lookup outcomes', async () => {
    expect((await api.dealerLookup('gst', DEMO.gstin)).maskedEmail).toContain('*');
    expect((await api.dealerLookup('vat', DEMO.tin)).maskedEmail).toContain('*');
    expect((await code(api.dealerLookup('gst', '33AAAAA0000A1Z5')))?.code).toBe('NO_ACTIVE_GSTIN');
    expect((await code(api.dealerLookup('vat', '33999999999')))?.code).toBe('NO_ACTIVE_TIN');
    expect((await code(api.dealerLookup('gst', DEMO.gstinNoEmail)))?.code).toBe('NO_REGISTERED_EMAIL');
  });
  it('dealer OTP login', async () => {
    const lk = await api.dealerLookup('gst', DEMO.gstin);
    const ch = await api.dealerSendOtp(lk.lookupId);
    expect((await api.dealerVerify(ch.challengeId, DEMO.otp)).userType).toBe('dealer');
  });
  it('registration needs OTP, rejects existing email, does not auto-login', async () => {
    const input = { name: 'A Kumar', email: 'new@example.com', mobile: '9876543210', district: 'Chennai', password: 'Abcd@1234' };
    expect((await code(api.registrationSendOtp({ ...input, email: DEMO.registered.email })))?.code).toBe('EMAIL_EXISTS');
    const ch = await api.registrationSendOtp(input);
    expect((await code(api.registeredLogin({ identifier: input.email, password: input.password })))?.code).toBe('INVALID_CREDENTIALS');
    await api.registrationVerify(ch.challengeId, DEMO.otp);
    const r = await api.registeredLogin({ identifier: input.email, password: input.password, captcha: await solve() });
    expect(r.displayName).toBe('A Kumar');
  });
  it('password reset', async () => {
    expect((await code(api.resetSendOtp('nobody@example.com')))?.code).toBe('NO_REGISTERED_EMAIL');
    const ch = await api.resetSendOtp(DEMO.registered.email);
    const { resetToken } = await api.resetVerify(ch.challengeId, DEMO.otp);
    await api.resetPassword(resetToken, 'NewPass@123');
    expect((await code(api.resetPassword(resetToken, 'Other@12345')))?.code).toBe('OTP_EXPIRED'); // consumed
    expect((await api.registeredLogin({ identifier: DEMO.registered.email, password: 'NewPass@123' })).userType).toBe('registered');
  });
});

describe('admin', () => {
  it('accepts email or configured username', async () => {
    expect((await api.adminLogin({ identifier: DEMO.admin.email, password: DEMO.admin.password })).userType).toBe('admin');
    expect((await api.adminLogin({ identifier: 'Admin Helpdesk', password: DEMO.admin.password })).userType).toBe('admin');
  });
});
