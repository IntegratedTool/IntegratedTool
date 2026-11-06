import { useEffect, useState } from 'react';
import { siteConfig } from '../config/site';
import { useI18n } from '../i18n';

/**
 * Current time in India (IST). With the database server the clock is corrected by the server's own time, so a wrong
 * clock on the user's computer does not show a wrong time. In demo mode it uses the computer's clock.
 */
export function useIstNow() {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (siteConfig.useMock) return;
    let live = true;
    const t0 = Date.now();
    fetch(`${siteConfig.apiBase}/time`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ now: string }>)
      .then((d) => { if (live) setOffset(new Date(d.now).getTime() - (t0 + Date.now()) / 2); })
      .catch(() => { /* keep the computer's clock */ });
    return () => { live = false; };
  }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(id); }, []);
  return new Date(now + offset);
}

/** Date and time under the language switch. Hidden from screen readers so it is not announced repeatedly. */
export function HeaderClock() {
  const { t, locale } = useI18n();
  const now = useIstNow();
  const tz = { timeZone: 'Asia/Kolkata' } as const;
  const date = new Intl.DateTimeFormat(locale, { ...tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat(locale, { ...tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(now);
  return (
    <div className="header-clock" role="group" aria-label={t('clock.label')}>
      <span>{date}</span>
      <strong aria-hidden="true">{time} IST</strong>
    </div>
  );
}
