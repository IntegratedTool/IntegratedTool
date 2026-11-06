import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Announcement } from '../services';
import { useI18n } from '../i18n';
import { Spinner } from './fields';

const SCROLL_PX_PER_SECOND = 30;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Announcement[] };

export function PublicAnnouncementPanel() {
  const { t, lang, locale } = useI18n();
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .getPublicAnnouncements()
      .then((items) => {
        // Latest first; the server also filters by publish/expiry dates and draft status.
        const sorted = [...items].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
        setState({ status: 'ready', items: sorted });
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  useEffect(load, [load]);

  const scrolling = !reduced && !userPaused && !hovered && !focused && state.status === 'ready';

  // Gentle auto-scroll. Paused on hover, keyboard focus, user pause, hidden tab and reduced motion.
  useEffect(() => {
    const el = listRef.current;
    if (!scrolling || !el) return;
    let raf = 0;
    let last = performance.now();
    let pos = el.scrollTop;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!document.hidden && el.scrollHeight > el.clientHeight) {
        if (Math.abs(el.scrollTop - pos) > 2) pos = el.scrollTop; // user scrolled manually: resync
        pos += SCROLL_PX_PER_SECOND * dt;
        if (pos >= el.scrollHeight - el.clientHeight) pos = 0; // loop back to the latest notice
        el.scrollTop = pos;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrolling]);

  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="card announcements" aria-labelledby="ann-title">
      <div className="announcements__head on-dark">
        <h2 id="ann-title">{t('ann.title')}</h2>
        {!reduced && state.status === 'ready' && (
          <button
            type="button"
            className="btn-ghost-light"
            aria-pressed={userPaused}
            onClick={() => setUserPaused((p) => !p)}
          >
            {userPaused ? `▶ ${t('ann.play')}` : `❚❚ ${t('ann.pause')}`}
          </button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="announcements__state" role="status">
          <Spinner />
          <p>{t('ann.loading')}</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="announcements__state" role="alert">
          <p>{t('ann.error')}</p>
          <button type="button" className="btn btn--secondary" onClick={load}>
            {t('ann.retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <div className="announcements__state">
          <p>{t('ann.empty')}</p>
        </div>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <>
          {reduced && (
            <p className="field__hint" style={{ padding: '8px 24px 0' }}>
              {t('ann.reducedMotion')}
            </p>
          )}
          {/* Scrollable region is focusable so keyboard users can scroll it with arrow keys. */}
          <ul
            ref={listRef}
            className="announcements__list"
            tabIndex={0}
            aria-label={t('ann.region')}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
            }}
          >
            {state.items.map((n) => {
              const open = expanded.has(n.id);
              const bodyId = `ann-${n.id}`;
              return (
                <li key={n.id} className="note-item">
                  <div className="note-meta">
                    <span className={`badge badge--${n.priority}`}>{t(`ann.priority.${n.priority}`)}</span>
                    {n.isSample && <span className="badge badge--sample">{t('ann.sample')}</span>}
                    <span>
                      {t('ann.published')}: <time dateTime={n.publishedOn}>{fmt(n.publishedOn)}</time>
                    </span>
                  </div>
                  <h3 lang={lang}>{n.title[lang]}</h3>
                  <div id={bodyId} hidden={!open}>
                    <p className="note-more">{n.summary[lang]}</p>
                    {n.attachmentUrl && (
                      <p className="note-more">
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer">
                          {t('ann.attachment')}
                          <span className="visually-hidden"> ({t('common.external')})</span>
                        </a>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="link-btn"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => toggle(n.id)}
                  >
                    {open ? t('ann.readLess') : t('ann.readMore')}
                    <span className="visually-hidden">: {n.title[lang]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
