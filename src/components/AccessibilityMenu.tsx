import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

const KEY = 'ctd-helpdesk-a11y';
const SIZES = [90, 100, 112, 125];
const SCHEMES = [['blue', '#2447b8'], ['green', '#0f8a64'], ['maroon', '#a3243f'], ['saffron', '#b96a00'], ['yellow', '#f2c200']] as const;
type Scheme = (typeof SCHEMES)[number][0];
interface Prefs { size: number; contrast: boolean; links: boolean; theme: 'light' | 'dark'; scheme: Scheme }
const DEFAULTS: Prefs = { size: 100, contrast: false, links: false, theme: 'light', scheme: 'blue' };

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    return {
      size: SIZES.includes(Number(p?.size)) ? Number(p?.size) : 100, contrast: p?.contrast === true, links: p?.links === true,
      theme: p?.theme === 'dark' ? 'dark' : 'light', scheme: SCHEMES.some((x) => x[0] === p?.scheme) ? (p!.scheme as Scheme) : 'blue',
    };
  } catch {
    return DEFAULTS;
  }
}
function apply(p: Prefs) {
  const r = document.documentElement;
  r.style.fontSize = `${p.size}%`;
  if (p.contrast) r.setAttribute('data-contrast', 'high'); else r.removeAttribute('data-contrast');
  if (p.links) r.setAttribute('data-links', 'underline'); else r.removeAttribute('data-links');
  r.setAttribute('data-theme', p.theme);
  r.setAttribute('data-scheme', p.scheme);
}

/** Accessibility options in a drop-down beside the language switch. Preferences stay in this browser only. */
export function AccessibilityMenu() {
  const { t } = useI18n();
  const [p, setP] = useState<Prefs>(load);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    apply(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  }, [p]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const step = (d: number) => setP((x) => ({ ...x, size: SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(x.size) + d))] }));
  return (
    <div className="a11y-menu" ref={box}>
      <button ref={btn} type="button" className="a11y-menu__btn" aria-expanded={open} aria-controls="a11y-panel" aria-label={t('a11y.bar')} title={t('a11y.bar')} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><circle cx="12" cy="4.2" r="2.2" /><path d="M5 8.2h14v2.2h-5.2v3.1l2.6 6.5-2.1.8L12 15.2l-2.3 5.6-2.1-.8 2.6-6.5v-3.1H5z" /></svg>
      </button>
      {open && (
        <div id="a11y-panel" className="a11y-menu__panel" role="group" aria-label={t('a11y.bar')}>
          <p className="a11y-menu__title">{t('a11y.theme')}</p>
          <div className="a11y-menu__row">
            <button type="button" className="a11y__btn" aria-pressed={p.theme === 'light'} onClick={() => setP((x) => ({ ...x, theme: 'light' }))}>☀ {t('a11y.light')}</button>
            <button type="button" className="a11y__btn" aria-pressed={p.theme === 'dark'} onClick={() => setP((x) => ({ ...x, theme: 'dark' }))}>☾ {t('a11y.dark')}</button>
          </div>
          <p className="a11y-menu__title">{t('a11y.scheme')}</p>
          <div className="swatches">
            {SCHEMES.map(([id, colour]) => (
              <button key={id} type="button" className="swatch" style={{ background: colour }} aria-pressed={p.scheme === id} aria-label={t(`a11y.scheme.${id}` as never)} title={t(`a11y.scheme.${id}` as never)} onClick={() => setP((x) => ({ ...x, scheme: id }))} />
            ))}
          </div>
          <p className="a11y-menu__title">{t('a11y.text')}</p>
          <div className="a11y-menu__row" role="group" aria-label={t('a11y.normal')}>
            <button type="button" className="a11y__btn" onClick={() => step(-1)} aria-label={t('a11y.smaller')} disabled={p.size <= SIZES[0]}>A−</button>
            <button type="button" className="a11y__btn" onClick={() => setP((x) => ({ ...x, size: 100 }))} aria-label={t('a11y.normal')} aria-pressed={p.size === 100}>A</button>
            <button type="button" className="a11y__btn" onClick={() => step(1)} aria-label={t('a11y.larger')} disabled={p.size >= SIZES[SIZES.length - 1]}>A+</button>
          </div>
          <button type="button" className="a11y-menu__opt" role="switch" aria-checked={p.contrast} onClick={() => setP((x) => ({ ...x, contrast: !x.contrast }))}>{t('a11y.contrast')}<span aria-hidden="true">{p.contrast ? 'On' : 'Off'}</span></button>
          <button type="button" className="a11y-menu__opt" role="switch" aria-checked={p.links} onClick={() => setP((x) => ({ ...x, links: !x.links }))}>{t('a11y.links')}<span aria-hidden="true">{p.links ? 'On' : 'Off'}</span></button>
          <button type="button" className="a11y-menu__opt a11y-menu__reset" onClick={() => setP(DEFAULTS)}>{t('a11y.reset')}</button>
        </div>
      )}
    </div>
  );
}
