/** API contracts shared by the mock and the real HTTP client. UI code depends only on these. */

export type ApiErrorCode =
  | 'INVALID_CREDENTIALS' // meta.captchaRequired = 1 when CAPTCHA must be shown from now on
  | 'CAPTCHA_MISSING'
  | 'CAPTCHA_INCORRECT'
  | 'CAPTCHA_EXPIRED'
  | 'ACCOUNT_BLOCKED' // officer account blocked after 3 consecutive wrong passwords
  | 'NO_ACTIVE_GSTIN'
  | 'NO_ACTIVE_TIN'
  | 'NO_REGISTERED_EMAIL'
  | 'EMAIL_EXISTS'
  | 'OTP_INVALID' // meta.left = attempts remaining
  | 'OTP_EXPIRED'
  | 'OTP_LOCKED' // meta.waitSeconds = remaining lock time
  | 'OTP_RESEND_WAIT'
  | 'SERVICE_UNAVAILABLE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN' // also used for "not found" so the existence of a ticket is not revealed
  | 'NOT_FOUND'
  | 'VALIDATION' // meta.field = offending field
  | 'INVALID_STATE' // ticket changed since the user loaded it
  | 'ROUTING_FAILED' // no valid assignee for the classification; nothing was created or changed
  | 'DUPLICATE_SUSPECTED' // meta.number = earlier case, meta.similarity = %, meta.blocked = 1 when it cannot be confirmed
  | 'OTP_RESEND_LIMIT'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly meta: Record<string, number | string> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export type UserKind = 'admin' | 'officer' | 'dealer' | 'registered';

/** What the signed-in account may do. The server decides; the UI only reflects it. */
export interface Capabilities {
  assignedTickets: boolean;
  helpdeskReview: boolean;
  mis: boolean;
  /** Admin / Helpdesk-Assigning only: Original/Transferred and assignment history */
  viewAssignmentHistory: boolean;
  reassign: boolean;
  sendToHelpdesk: boolean;
  /** May open "Raise a Ticket" */
  raise: boolean;
  /** Super Admin: may close Resolved cases and see every case */
  closeCases: boolean;
  /** Super Admin: settings console */
  console: boolean;
  /** Super Admin: dashboard and reports */
  dashboard: boolean;
}

export interface Prefill {
  name?: string;
  email?: string;
  mobile?: string;
}

export interface AuthResult {
  /** Display name only. The real session lives in an HttpOnly cookie set by the backend. */
  displayName: string;
  userType: UserKind;
  /** Stable internal identity (audit). Never taken from form input. */
  userId: string;
  capabilities: Capabilities;
  /** Reliable profile data to prefill the ticket form; may be empty */
  prefill: Prefill;
}

/** Server-generated CAPTCHA. The answer never reaches the browser in production. */
export interface CaptchaChallenge {
  id: string;
  imageUrl: string;
  expiresInSeconds: number;
}
export interface CaptchaAnswer {
  id: string;
  value: string;
}
/** Production returns an audio URL generated on the server. `speakText` exists in the MOCK only. */
export interface CaptchaAudio {
  url?: string;
  speakText?: string;
}

export interface PasswordLoginInput {
  /** Admin: email or configured username. Officer: GPF/CPS number. Registered user: email. */
  identifier: string;
  password: string;
  /** Sent only after the server has asked for a CAPTCHA (after the first incorrect attempt). */
  captcha?: CaptchaAnswer;
}

export interface OtpChallenge {
  challengeId: string;
  /** Already masked by the server. The full address never reaches the browser. */
  maskedEmail: string;
  validitySeconds: number;
  resendAfterSeconds: number;
  maxAttempts: number;
  /** Resends still allowed for this sign-in */
  resendsLeft?: number;
}

export type DealerKind = 'gst' | 'vat';
export interface DealerLookup {
  lookupId: string;
  maskedEmail: string;
}

export interface RegistrationInput {
  name: string;
  email: string;
  mobile: string;
  district: string;
  password: string;
}

export type Priority = 'high' | 'normal' | 'info';

export interface Announcement {
  id: string;
  title: Record<'en' | 'ta', string>;
  summary: Record<'en' | 'ta', string>;
  publishedOn: string; // ISO date
  priority: Priority;
  attachmentUrl?: string;
  /** True for placeholder content so it can never be mistaken for an official notice */
  isSample?: boolean;
}

export interface AuthApi {
  logout(): Promise<void>;
  captchaNew(): Promise<CaptchaChallenge>;
  captchaAudio(id: string): Promise<CaptchaAudio>;

  adminLogin(input: PasswordLoginInput): Promise<AuthResult>;
  officerLogin(input: PasswordLoginInput): Promise<AuthResult>;
  registeredLogin(input: PasswordLoginInput): Promise<AuthResult>;

  /** Officer unblock: OTP goes only to the email registered in TSP2.0. Does not log the officer in. */
  officerSendUnblockOtp(gpf: string): Promise<OtpChallenge>;
  officerUnblockVerify(challengeId: string, otp: string): Promise<void>;

  dealerLookup(kind: DealerKind, identifier: string): Promise<DealerLookup>;
  dealerSendOtp(lookupId: string): Promise<OtpChallenge>;
  dealerVerify(challengeId: string, otp: string): Promise<AuthResult>;

  registrationSendOtp(input: RegistrationInput): Promise<OtpChallenge>;
  registrationVerify(challengeId: string, otp: string): Promise<void>;

  resetSendOtp(email: string): Promise<OtpChallenge>;
  resetVerify(challengeId: string, otp: string): Promise<{ resetToken: string }>;
  resetPassword(resetToken: string, newPassword: string): Promise<void>;

  /** Resend for any OTP purpose; invalidates the previous OTP, does not reset the failed-attempt counter. */
  otpResend(challengeId: string): Promise<OtpChallenge>;

  getDistricts(): Promise<string[]>;
  getPublicAnnouncements(): Promise<Announcement[]>;
}
