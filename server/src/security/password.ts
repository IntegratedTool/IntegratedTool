import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

export type HashAlgo = 'auto' | 'md5' | 'sha1' | 'sha256' | 'sha512' | 'bcrypt';
export type KnownAlgo = Exclude<HashAlgo, 'auto'>;

const HEX_LEN: Record<number, KnownAlgo> = { 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' };

/** Best guess of how a stored value was produced, from its shape only. */
export function detectAlgo(stored: string): KnownAlgo | 'unknown' {
  if (/^\$2[aby]\$\d{2}\$/.test(stored)) return 'bcrypt';
  if (/^[0-9a-fA-F]+$/.test(stored) && HEX_LEN[stored.length]) return HEX_LEN[stored.length];
  return 'unknown';
}

const hex = (algo: Exclude<KnownAlgo, 'bcrypt'>, v: string) => createHash(algo).update(v, 'utf8').digest('hex');

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), 'utf8');
  const y = Buffer.from(b.toLowerCase(), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Hashes what the user typed and compares it with the stored hash. Nothing is ever decrypted. */
export async function verifyPassword(stored: string | null | undefined, supplied: string, algo: HashAlgo = 'auto'): Promise<boolean> {
  if (!stored || !supplied) return false;
  const s = stored.trim();
  const a = algo === 'auto' ? detectAlgo(s) : algo;
  if (a === 'unknown') return false;
  if (a === 'bcrypt') return bcrypt.compare(supplied, s).catch(() => false);
  return sameHex(hex(a, supplied), s);
}

/** For the hash-test tool: which algorithms reproduce the stored value from the typed password. */
export async function matchingAlgos(stored: string, supplied: string): Promise<KnownAlgo[]> {
  const out: KnownAlgo[] = [];
  for (const a of ['md5', 'sha1', 'sha256', 'sha512', 'bcrypt'] as const) if (await verifyPassword(stored, supplied, a)) out.push(a);
  return out;
}
