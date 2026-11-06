/**
 * Real HTTP client for the Spring Boot backend.
 * Session state is an HttpOnly cookie managed by the server; nothing secret is kept in JS or localStorage.
 * Endpoint paths are the proposed contract and can be adjusted when the OpenAPI spec is finalised.
 */
import { request } from './http';
import {
  type Announcement,
  type AuthApi,
  type AuthResult,
  type CaptchaAudio,
  type CaptchaChallenge,
  type DealerLookup,
  type OtpChallenge,
} from './types';

export const httpApi: AuthApi = {
  logout: () => request<void>('/auth/logout', {}),
  captchaNew: () => request<CaptchaChallenge>('/captcha', undefined, 'GET'),
  captchaAudio: (id) => request<CaptchaAudio>(`/captcha/${encodeURIComponent(id)}/audio`, undefined, 'GET'),

  adminLogin: (i) => request<AuthResult>('/auth/admin/login', i),
  officerLogin: (i) => request<AuthResult>('/auth/officer/login', i),
  registeredLogin: (i) => request<AuthResult>('/auth/registered/login', i),

  officerSendUnblockOtp: (gpf) => request<OtpChallenge>('/auth/officer/unblock/otp', { gpf }),
  officerUnblockVerify: (challengeId, otp) =>
    request<void>('/auth/officer/unblock/verify', { challengeId, otp }),

  dealerLookup: (kind, identifier) => request<DealerLookup>('/auth/dealer/lookup', { kind, identifier }),
  dealerSendOtp: (lookupId) => request<OtpChallenge>('/auth/dealer/otp', { lookupId }),
  dealerVerify: (challengeId, otp) => request<AuthResult>('/auth/dealer/verify', { challengeId, otp }),

  registrationSendOtp: (input) => request<OtpChallenge>('/auth/register/otp', input),
  registrationVerify: (challengeId, otp) => request<void>('/auth/register/verify', { challengeId, otp }),

  resetSendOtp: (email) => request<OtpChallenge>('/auth/reset/otp', { email }),
  resetVerify: (challengeId, otp) =>
    request<{ resetToken: string }>('/auth/reset/verify', { challengeId, otp }),
  resetPassword: (resetToken, newPassword) => request<void>('/auth/reset/password', { resetToken, newPassword }),

  otpResend: (challengeId) => request<OtpChallenge>('/auth/otp/resend', { challengeId }),

  getDistricts: () => request<string[]>('/public/districts'),
  getPublicAnnouncements: () => request<Announcement[]>('/public/announcements'),
};
