export function fmtDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}
export function fmtDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}
export const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
export const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb(bytes)} MB`);
