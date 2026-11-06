/** Client-side validators: usability aids only. The backend re-validates everything. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Name: up to 60 characters, English letters, spaces, full stops and commas only. */
export const NAME_RE = /^[A-Za-z .,]{1,60}$/;
export const MOBILE_RE = /^[0-9]{10}$/;
/** GSTIN: exactly 15 alphanumeric characters starting with 33. */
export const GSTIN_RE = /^33[0-9A-Z]{13}$/;
/** TIN: exactly 11 digits starting with 33. */
export const TIN_RE = /^33[0-9]{9}$/;
export const CAPTCHA_RE = /^[A-Za-z0-9]{6}$/;
/** CAPTCHA alphabet: uppercase letters and digits, excluding 0, O, I, 1, L, U, V, T, J. */
export const CAPTCHA_ALPHABET = 'ABCDEFGHKMNPQRSWXYZ23456789';

export const normaliseGstin = (v: string) => v.replace(/\s+/g, '').toUpperCase();
export const normaliseTin = (v: string) => v.replace(/\s+/g, '');

export function isValidName(v: string): boolean {
  return v.trim().length > 0 && NAME_RE.test(v);
}

/** 8–16 characters; upper, lower, number and special character; no spaces. Never trims or alters the password. */
export function isStrongPassword(p: string): boolean {
  return (
    p.length >= 8 &&
    p.length <= 16 &&
    !/\s/.test(p) &&
    /[a-z]/.test(p) &&
    /[A-Z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^A-Za-z0-9\s]/.test(p)
  );
}

/** Admin ID: an email with the exact domain tn.gov.in, or the configured username. */
export function isAdminIdentifier(v: string, adminUsername: string): boolean {
  const t = v.trim();
  return /^[^\s@]+@tn\.gov\.in$/i.test(t) || t.toLowerCase() === adminUsername.toLowerCase();
}

/** Mask an email for display, e.g. o*****o@tn.gov.in. Used by the mock "server" and for the user's own typed address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '******';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown =
    local.length <= 2 ? `${local[0]}*` : `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}
