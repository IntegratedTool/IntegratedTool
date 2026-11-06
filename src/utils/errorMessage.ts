import { ApiError } from '../services';
import type { TKey } from '../i18n';
import { formatTime } from './time';

export type ErrorContext = 'admin' | 'officer' | 'registered' | 'dealer-gst' | 'dealer-tin' | 'reset' | 'other';

export interface Msg {
  key: TKey;
  vars?: Record<string, string | number>;
}

/** Map an API error to a translation key plus values. Credential errors stay generic. */
export function errorToMessage(e: unknown, ctx: ErrorContext = 'other', digits = 6): Msg {
  if (!(e instanceof ApiError)) return { key: 'err.generic' };
  switch (e.code) {
    case 'INVALID_CREDENTIALS':
      return {
        key: ctx === 'admin' ? 'err.invalidAdmin' : ctx === 'officer' ? 'err.invalidOfficer' : 'err.invalidRegistered',
      };
    case 'CAPTCHA_MISSING':
      return { key: 'err.captchaRequired' };
    case 'CAPTCHA_INCORRECT':
      return { key: 'err.captchaIncorrect' };
    case 'CAPTCHA_EXPIRED':
      return { key: 'err.captchaExpired' };
    case 'ACCOUNT_BLOCKED':
      return { key: 'err.blocked' };
    case 'NO_ACTIVE_GSTIN':
      return { key: 'err.noActiveGstin' };
    case 'NO_ACTIVE_TIN':
      return { key: 'err.noActiveTin' };
    case 'NO_REGISTERED_EMAIL':
      return { key: ctx === 'reset' ? 'err.noAccount' : 'err.noRegisteredEmail' };
    case 'EMAIL_EXISTS':
      return { key: 'err.emailExists' };
    case 'OTP_INVALID':
      return { key: 'err.otpInvalid' };
    case 'OTP_EXPIRED':
      return { key: 'err.otpExpired' };
    case 'OTP_LOCKED':
      return { key: 'otp.lockedNote', vars: { time: formatTime(Number(e.meta.waitSeconds ?? 0)) } };
    case 'OTP_RESEND_WAIT':
      return { key: 'err.otpResendWait' };
    case 'OTP_RESEND_LIMIT':
      return { key: 'err.otpResendLimit' };
    case 'RATE_LIMITED':
      return { key: 'err.rateLimited' };
    case 'SERVICE_UNAVAILABLE':
      return { key: 'err.unavailable' };
    case 'UNAUTHENTICATED':
      return { key: 'err.t.session' };
    case 'FORBIDDEN':
    case 'NOT_FOUND':
      return { key: 'err.t.forbidden' };
    case 'INVALID_STATE':
      return { key: 'err.t.stale' };
    case 'ROUTING_FAILED':
      return { key: 'raise.routingFailed' };
    case 'VALIDATION':
      return { key: 'err.t.reason' };
    case 'NETWORK':
      return { key: 'err.network' };
    default:
      void digits;
      return { key: 'err.generic' };
  }
}
