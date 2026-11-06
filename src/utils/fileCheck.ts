import { ALLOWED_EXT, fileExt } from './ticketValidation';

/**
 * Checks the extension AND the leading bytes, so a renamed file is rejected.
 * (The server must repeat this on the stored upload.)
 */
export async function looksLikeAllowedFile(file: File): Promise<boolean> {
  const ext = fileExt(file.name);
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) return false;
  const buf = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return ext === 'pdf' ? isPdf : isJpg;
}
