import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { FALLBACK, GREETING, KB, bestAnswer, type BotLang } from '../utils/helpbotKb';

interface Msg { who: 'bot' | 'me'; text: string }

/** Help assistant: keyword answers from a fixed, reviewed list. It does not use AI, store anything or contact a server. */
export function HelpBot() {
  const { t, lang } = useI18n();
  const l = lang as BotLang;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [log, setLog] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { input.current?.focus(); end.current?.scrollIntoView?.({ block: 'end' }); } }, [open, log]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); fab.current?.focus(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const ask = (q: string, shown?: string) => {
    const e = bestAnswer(q);
    setLog((m) => [...m, { who: 'me', text: shown ?? q }, { who: 'bot', text: (e ? e.answer : FALLBACK)[l] }]);
  };

  return (
    <>
      <button ref={fab} type="button" className="helpbot__fab" aria-expanded={open} aria-controls="helpbot" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">💬</span> {t('bot.open')}
      </button>
      {open && (
        <section id="helpbot" className="helpbot" aria-label={t('bot.title')}>
          <div className="helpbot__head">
            <h2>{t('bot.title')}<small>{t('bot.sub')}</small></h2>
            <button type="button" className="helpbot__x" onClick={() => { setOpen(false); fab.current?.focus(); }}>{t('bot.close')}</button>
          </div>
          <div className="helpbot__log" role="log" aria-live="polite">
            <div className="helpbot__msg helpbot__msg--bot">{GREETING[l]}</div>
            {log.map((m, i) => <div key={i} className={`helpbot__msg helpbot__msg--${m.who}`}>{m.text}</div>)}
            <div ref={end} />
          </div>
          <div className="helpbot__chips" role="group" aria-label={t('bot.topics')}>
            {KB.map((e) => <button key={e.id} type="button" className="helpbot__chip" onClick={() => ask(e.keys[0], e.topic[l])}>{e.topic[l]}</button>)}
          </div>
          <form className="helpbot__form" onSubmit={(ev) => { ev.preventDefault(); if (text.trim()) { ask(text.trim()); setText(''); } }}>
            <input ref={input} className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label={t('bot.input')} placeholder={t('bot.input')} />
            <button type="submit" className="btn btn--primary">{t('bot.send')}</button>
          </form>
          <p className="helpbot__note">{t('bot.note')}</p>
        </section>
      )}
    </>
  );
}
