import { randomBytes, randomInt } from 'node:crypto';
import { CAPTCHA_ALPHABET } from '../../../src/utils/validation.js';
import { ApiError, type CaptchaChallenge } from '../../../src/services/types.js';

const TTL_S = 120;
const store = new Map<string, { answer: string; expiresAt: number }>();

const rnd = (n: number) => randomInt(0, n);

function svg(text: string): string {
  const chars = [...text]
    .map((c, i) => {
      const x = 10 + i * 26;
      const y = 32 + rnd(7) - 3;
      return `<text x="${x}" y="${y}" transform="rotate(${rnd(31) - 15} ${x} ${y})" font-family="Verdana,sans-serif" font-size="24" font-weight="700" fill="#1f3a5f">${c}</text>`;
    })
    .join('');
  const lines = Array.from({ length: 5 })
    .map(() => `<line x1="${rnd(170)}" y1="${rnd(44)}" x2="${rnd(170)}" y2="${rnd(44)}" stroke="#7a8ca5" stroke-width="1.2" opacity=".6"/>`)
    .join('');
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="44" viewBox="0 0 170 44"><rect width="170" height="44" fill="#eef3f9"/>${lines}${chars}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}

export function newCaptcha(): CaptchaChallenge {
  sweep();
  const answer = Array.from({ length: 6 }, () => CAPTCHA_ALPHABET[rnd(CAPTCHA_ALPHABET.length)]).join('');
  const id = `cap-${randomBytes(9).toString('hex')}`;
  store.set(id, { answer, expiresAt: Date.now() + TTL_S * 1000 });
  return { id, imageUrl: svg(answer), expiresInSeconds: TTL_S };
}

/** Audio alternative. Prototype: the browser reads the characters aloud; production should return a server-generated audio file. */
export function captchaSpeech(id: string): { speakText: string } {
  const rec = store.get(id);
  if (!rec) throw new ApiError('CAPTCHA_EXPIRED');
  return { speakText: [...rec.answer].join(' ') };
}

/** Single use: a wrong attempt consumes the CAPTCHA. */
export function checkCaptcha(c: { id: string; value: string } | undefined): void {
  if (!c || !c.value) throw new ApiError('CAPTCHA_MISSING', { captchaRequired: 1 });
  const rec = store.get(c.id);
  store.delete(c.id);
  if (!rec || Date.now() > rec.expiresAt) throw new ApiError('CAPTCHA_EXPIRED', { captchaRequired: 1 });
  if (rec.answer !== c.value.trim().toUpperCase()) throw new ApiError('CAPTCHA_INCORRECT', { captchaRequired: 1 });
}

/** Test hook. */
export const peekAnswer = (id: string) => store.get(id)?.answer;
