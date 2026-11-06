/**
 * Every setting the Super Admin console can change. One definition drives the server (validation, defaults)
 * and the console screen (labels, controls), so they cannot drift apart.
 */
export type SettingType = 'int' | 'bool' | 'enum' | 'codes';
export interface SettingDef {
  key: string;
  group: string;
  type: SettingType;
  label: string;
  help: string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

export const SETTING_GROUPS = ['Case details', 'Contact details', 'Attachments', 'Case lifecycle', 'Duplicate cases', 'OTP', 'Sign-in'] as const;

export const SETTINGS: SettingDef[] = [
  { key: 'case.minWords', group: 'Case details', type: 'int', label: 'Minimum words in Case details', help: 'A case shorter than this is not accepted.', default: 20, min: 1, max: 200, unit: 'words' },
  { key: 'case.maxWords', group: 'Case details', type: 'int', label: 'Maximum words in Case details', help: 'A case longer than this is not accepted.', default: 1000, min: 50, max: 5000, unit: 'words' },
  { key: 'form.requireEmail', group: 'Contact details', type: 'bool', label: 'E-mail is mandatory', help: 'When off, the e-mail field can be left empty (a value, if typed, is still checked).', default: true },
  { key: 'form.requireMobile', group: 'Contact details', type: 'bool', label: 'Mobile number is mandatory', help: 'When off, the mobile field is optional.', default: false },
  { key: 'file.maxFiles', group: 'Attachments', type: 'int', label: 'Maximum files per case', help: 'Hardware cases still need the serial number proof.', default: 2, min: 1, max: 5, unit: 'files' },
  { key: 'file.maxFileMB', group: 'Attachments', type: 'int', label: 'Maximum size of one file', help: 'Also limited by the server upload limit.', default: 5, min: 1, max: 25, unit: 'MB' },
  { key: 'file.maxTotalMB', group: 'Attachments', type: 'int', label: 'Maximum total size of all files', help: '', default: 10, min: 1, max: 50, unit: 'MB' },
  { key: 'file.blockDuplicateNames', group: 'Attachments', type: 'bool', label: 'Refuse two files with the same name in one case', help: 'Names are compared ignoring capital letters.', default: true },
  { key: 'file.blockActivePdf', group: 'Attachments', type: 'bool', label: 'Refuse PDFs that contain scripts or launch actions', help: 'Protects officers who open the file.', default: true },
  { key: 'life.withdrawEnabled', group: 'Case lifecycle', type: 'bool', label: 'Raiser may withdraw a case while it is New', help: 'Withdrawal is never possible once work has started.', default: true },
  { key: 'life.reopenDays', group: 'Case lifecycle', type: 'int', label: 'Reopen window after Resolved', help: '0 switches reopening off.', default: 7, min: 0, max: 60, unit: 'days' },
  { key: 'life.autoCloseEnabled', group: 'Case lifecycle', type: 'bool', label: 'Close Resolved cases automatically', help: 'Applies to cases that were not reopened or closed.', default: true },
  { key: 'life.autoCloseDays', group: 'Case lifecycle', type: 'int', label: 'Automatic closure after', help: 'Counted from the day the case was resolved.', default: 7, min: 1, max: 60, unit: 'days' },
  { key: 'dup.enabled', group: 'Duplicate cases', type: 'bool', label: 'Detect repeated cases', help: 'Compares new case details with the raiser’s own open cases of the same classification.', default: true },
  { key: 'dup.mode', group: 'Duplicate cases', type: 'enum', label: 'When a repeat is suspected', help: 'Warn lets the raiser confirm and submit anyway; Block refuses.', default: 'warn', options: [{ value: 'warn', label: 'Warn and ask to confirm' }, { value: 'block', label: 'Block' }] },
  { key: 'dup.threshold', group: 'Duplicate cases', type: 'int', label: 'Similarity threshold', help: 'Higher = only near-identical text is flagged. 85 is a good start.', default: 85, min: 50, max: 100, unit: '%' },
  { key: 'dup.lookbackDays', group: 'Duplicate cases', type: 'int', label: 'Look back', help: 'Only open cases raised within this many days are compared.', default: 30, min: 1, max: 365, unit: 'days' },
  { key: 'otp.maxAttempts', group: 'OTP', type: 'int', label: 'Wrong OTP entries allowed', help: 'After this many wrong entries the OTP is locked for 20 minutes.', default: 3, min: 1, max: 10 },
  { key: 'otp.maxResends', group: 'OTP', type: 'int', label: 'OTP resends allowed', help: '', default: 3, min: 0, max: 10 },
  { key: 'otp.validitySeconds', group: 'OTP', type: 'int', label: 'OTP validity', help: '', default: 120, min: 30, max: 600, unit: 'seconds' },
  { key: 'otp.resendWaitSeconds', group: 'OTP', type: 'int', label: 'Wait before resend', help: '', default: 60, min: 10, max: 300, unit: 'seconds' },
  { key: 'login.pwdExpiryEnabled', group: 'Sign-in', type: 'bool', label: 'Administrator passwords expire', help: 'Needs the “password last changed” date of each account; until that column is connected this setting is saved but not enforced. Expired users will be sent to the existing password-reset process.', default: false },
  { key: 'login.pwdExpiryDays', group: 'Sign-in', type: 'int', label: 'Password expires after', help: 'Counted from the day the password was last changed.', default: 90, min: 30, max: 365, unit: 'days' },
  { key: 'login.allowedStateCodes', group: 'Sign-in', type: 'codes', label: 'GSTIN state codes accepted at sign-in', help: 'Comma-separated 2-digit codes, for example 33.', default: '33' },
  { key: 'login.gstinChecksum', group: 'Sign-in', type: 'bool', label: 'Verify the GSTIN check character', help: 'Catches mistyped numbers before any lookup.', default: true },
];

export type SettingValue = number | boolean | string;
export type Settings = Record<string, SettingValue>;

export const defaultSettings = (): Settings => Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));

/** Returns the cleaned value, or null when it is not acceptable for this setting. */
export function cleanSetting(def: SettingDef, raw: unknown): SettingValue | null {
  switch (def.type) {
    case 'bool':
      return typeof raw === 'boolean' ? raw : null;
    case 'int': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      return typeof n === 'number' && Number.isInteger(n) && n >= (def.min ?? 0) && n <= (def.max ?? 1e9) ? n : null;
    }
    case 'enum':
      return typeof raw === 'string' && def.options?.some((o) => o.value === raw) ? raw : null;
    case 'codes': {
      if (typeof raw !== 'string') return null;
      const list = raw.split(',').map((x) => x.trim()).filter(Boolean);
      return list.length > 0 && list.every((x) => /^[0-9]{2}$/.test(x)) ? [...new Set(list)].join(',') : null;
    }
  }
}

/** Cross-field rules. Returns a message, or null when the whole set is consistent. */
export function settingsConflict(s: Settings): string | null {
  if (Number(s['case.minWords']) >= Number(s['case.maxWords'])) return 'Minimum words must be smaller than maximum words.';
  if (Number(s['file.maxFileMB']) > Number(s['file.maxTotalMB'])) return 'One file cannot be allowed to be larger than the total.';
  return null;
}
