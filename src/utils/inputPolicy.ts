/**
 * Input policy shared by the forms and the server.
 * SQL injection is prevented by parameterised queries everywhere; this policy is an additional layer that keeps
 * markup, control characters and look-alike text tricks out of stored data, and keeps values inside column sizes.
 */
// Short fields: everything is allowed except the few characters used in markup, script, shell and path tricks (< > ` \\ { } | ^ ~ $ ; " = % *).
const SHORT_BAD = /[<>`\\{}|^~$;"=%*]/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const BIDI_OR_ZERO_WIDTH = /[​-‏‪-‮⁠-⁩﻿]/;

/** Short single-line fields (names, numbers, place names). */
export const shortTextOk = (s: string) => !SHORT_BAD.test(s) && !CONTROL.test(s) && !BIDI_OR_ZERO_WIDTH.test(s);
/** Free text (case details, remarks): any language and normal punctuation (quotes, ; = % etc. are fine), but no markup brackets, backticks, backslashes, braces, pipes, control or hidden direction characters. */
export const longTextOk = (s: string) => !/[<>`\\{}|$]/.test(s) && !CONTROL.test(s) && !BIDI_OR_ZERO_WIDTH.test(s);

export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const EXEC_EXT = ['exe', 'com', 'bat', 'cmd', 'msi', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'ps1', 'sh', 'scr', 'dll', 'jar', 'php', 'html', 'htm', 'svg', 'hta', 'lnk', 'reg', 'apk', 'zip', 'rar', 'iso'];

/** File name rules: sensible length, no path or reserved characters, no executable extension hidden inside (e.g. report.exe.pdf). */
export function fileNameProblem(name: string): 'chars' | 'long' | 'ext' | null {
  if (!name || name.length > 100) return 'long';
  if (/[\\/:*?"<>|]/.test(name) || CONTROL.test(name) || BIDI_OR_ZERO_WIDTH.test(name) || name.startsWith('.')) return 'chars';
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) return 'ext';
  if (parts.slice(1, -1).some((p) => EXEC_EXT.includes(p.trim()))) return 'ext';
  return null;
}
