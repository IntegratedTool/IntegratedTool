import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

const KEY = 'ctd-helpdesk-a11y';
interface Prefs { size: number; contrast: boolean; links: boolean }
const DEFAULTS: Prefs = { size: 100, contrast: false, links: false };

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    return { size: [90, 100, 112, 125].includes(Number(p?.size)) ? Number(p?.size) : 100, contrast: p?.contrast === true, links: p?.links === true };
  } catch {
    return DEFAULTS;
  }
}
function apply(p: Prefs) {
  const r = document.documentElement;
  r.style.fontSize = `${p.size}%`;
  if (p.contrast) r.setAttribute('data-contrast', 'high'); else r.removeAttribute('data-contrast');
  if (p.links) r.setAttribute('data-links', 'underline'); else r.removeAttribute('data-links');
}

/** Live date and time (IST) plus the standard accessibility options. Preferences are kept in this browser only. */
export function UtilityBar() {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [p, setP] = useState<Prefs>(load);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    apply(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  }, [p]);

  const tz = { timeZone: 'Asia/Kolkata' } as const;
  const date = new Intl.DateTimeFormat(locale, { ...tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat(locale, { ...tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  const step = (d: number) => setP((x) => { const sizes = [90, 100, 112, 125]; const i = Math.min(3, Math.max(0, sizes.indexOf(x.size) + d)); return { ...x, size: sizes[i] }; });

  return (
    <div className="utility">
      <div className="utility__inner">
        <div className="clock" role="group" aria-label={t('clock.label')}>
          <span className="clock__date">{date}</span>
          <span className="clock__time" aria-hidden="true">{time} IST</span>
        </div>
        <div className="a11y" role="toolbar" aria-label={t('a11y.bar')}>
          <button type="button" className="a11y__btn" onClick={() => step(-1)} aria-label={t('a11y.smaller')} title={t('a11y.smaller')} disabled={p.size <= 90}>A−</button>
          <button type="button" className="a11y__btn" onClick={() => setP((x) => ({ ...x, size: 100 }))} aria-label={t('a11y.normal')} title={t('a11y.normal')} aria-pressed={p.size === 100}>A</button>
          <button type="button" className="a11y__btn" onClick={() => step(1)} aria-label={t('a11y.larger')} title={t('a11y.larger')} disabled={p.size >= 125}>A+</button>
          <button type="button" className="a11y__btn a11y__btn--wide" onClick={() => setP((x) => ({ ...x, contrast: !x.contrast }))} aria-pressed={p.contrast}>{t('a11y.contrast')}</button>
          <button type="button" className="a11y__btn a11y__btn--wide" onClick={() => setP((x) => ({ ...x, links: !x.links }))} aria-pressed={p.links}>{t('a11y.links')}</button>
          <button type="button" className="a11y__btn a11y__btn--wide" onClick={() => setP(DEFAULTS)}>{t('a11y.reset')}</button>
        </div>
      </div>
    </div>
  );
}
