/** Text similarity for spotting repeated cases (Levenshtein edit distance, normalised to 0..1). */
export const normaliseForCompare = (s: string) =>
  s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical after normalisation, 0 = nothing in common. Returns 0 quickly when the lengths alone rule a match out. */
export function similarity(x: string, y: string, atLeast = 0): number {
  const a = normaliseForCompare(x);
  const b = normaliseForCompare(y);
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  if (atLeast > 0 && Math.abs(a.length - b.length) > (1 - atLeast) * max) return 0;
  return 1 - levenshtein(a, b) / max;
}
