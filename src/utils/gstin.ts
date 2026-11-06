/**
 * GSTIN (15 characters) and TIN (11 digits) validation, shared by the login form and the server.
 *  1-2  state code          3-12 PAN (AAAAA9999A)     13 entity number (1-9, then A-Z)
 *  14   default 'Z'         15   check character (mod-36 checksum)
 */
export const GST_STATE_CODES = new Set<string>([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99']);
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type GstinProblem = 'len' | 'state' | 'pan' | 'entity' | 'z' | 'check';

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Returns the first problem found, or null when the GSTIN is structurally valid. */
export function gstinProblem(raw: string, opts: { checksum?: boolean } = {}): GstinProblem | null {
  const v = raw.trim().toUpperCase();
  if (v.length !== 15 || !/^[0-9A-Z]+$/.test(v)) return 'len';
  if (!GST_STATE_CODES.has(v.slice(0, 2))) return 'state';
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.slice(2, 12))) return 'pan';
  if (!/^[1-9A-Z]$/.test(v[12])) return 'entity';
  if (v[13] !== 'Z') return 'z';
  if (opts.checksum !== false && gstinCheckChar(v.slice(0, 14)) !== v[14]) return 'check';
  return null;
}

export type TinProblem = 'len' | 'state';
export function tinProblem(raw: string): TinProblem | null {
  const v = raw.trim();
  if (!/^[0-9]{11}$/.test(v)) return 'len';
  if (!GST_STATE_CODES.has(v.slice(0, 2))) return 'state';
  return null;
}
