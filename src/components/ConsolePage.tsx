import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { ApiError, adminApi, type SettingsDoc } from '../services';
import { SETTINGS, SETTING_GROUPS, cleanSetting, defaultSettings, settingsConflict, type SettingValue, type Settings } from '../utils/settingsSchema';
import { useSession } from '../session';
import { AccessibleNotification } from './AccessibleNotification';
import { Spinner } from './fields';
import { PageTitle } from './PageTitle';

const show = (v: SettingValue) => (typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v));

export function ConsolePage() {
  const { t } = useI18n();
  const { endSession } = useSession();
  const [doc, setDoc] = useState<SettingsDoc | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<'saved' | 'saveError' | 'invalid' | null>(null);
  const defaults = useMemo(defaultSettings, []);

  const load = () => {
    setFailed(false);
    adminApi.getSettings().then((d) => {
      setDoc(d);
      setDraft(Object.fromEntries(SETTINGS.map((s) => [s.key, typeof d.values[s.key] === 'boolean' ? d.values[s.key] as boolean : String(d.values[s.key] ?? s.default)])));
    }).catch((e) => (e instanceof ApiError && e.code === 'UNAUTHENTICATED' ? endSession() : setFailed(true)));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cleaned = useMemo(() => {
    const out: Settings = {};
    const bad: Record<string, true> = {};
    for (const s of SETTINGS) {
      const raw = draft[s.key];
      const v = raw === undefined ? null : cleanSetting(s, s.type === 'int' && typeof raw === 'string' ? raw : raw);
      if (v === null) bad[s.key] = true; else out[s.key] = v;
    }
    return { out, bad };
  }, [draft]);
  const conflict = Object.keys(cleaned.bad).length === 0 ? settingsConflict(cleaned.out) : null;
  const dirty = !!doc && SETTINGS.some((s) => String(draft[s.key]) !== String(doc.values[s.key]));
  const invalid = Object.keys(cleaned.bad).length > 0 || !!conflict;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = async () => {
    if (invalid) return setMsg('invalid');
    setBusy(true);
    setMsg(null);
    try {
      const d = await adminApi.saveSettings(cleaned.out);
      setDoc(d);
      setMsg('saved');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') endSession(); else setMsg('saveError');
    } finally {
      setBusy(false);
    }
  };
  const discard = () => { if (doc) setDraft(Object.fromEntries(SETTINGS.map((s) => [s.key, typeof doc.values[s.key] === 'boolean' ? doc.values[s.key] as boolean : String(doc.values[s.key])]))); setMsg(null); };

  if (failed) return (<section><PageTitle>{t('con.title')}</PageTitle><AccessibleNotification kind="error">{t('con.loadError')}</AccessibleNotification><button type="button" className="btn btn--secondary" onClick={load}>{t('btn.retry')}</button></section>);
  if (!doc) return (<section><PageTitle>{t('con.title')}</PageTitle><p><Spinner /> {t('list.loading')}</p></section>);

  return (
    <section aria-labelledby="page-title" className="console">
      <PageTitle>{t('con.title')}</PageTitle>
      <p className="field__hint">{t('con.intro')}</p>
      {msg === 'saved' && <AccessibleNotification kind="success">{t('con.saved')}</AccessibleNotification>}
      {msg === 'saveError' && <AccessibleNotification kind="error">{t('con.saveError')}</AccessibleNotification>}
      {(msg === 'invalid' || conflict) && <AccessibleNotification kind="error">{conflict ?? t('con.invalid')}</AccessibleNotification>}

      {SETTING_GROUPS.map((g) => (
        <fieldset className="group" key={g}>
          <legend>{g}</legend>
          <div className="console__rows">
            {SETTINGS.filter((s) => s.group === g).map((s) => {
              const id = `set-${s.key}`;
              const changedMeta = doc.meta[s.key];
              const bad = !!cleaned.bad[s.key];
              const isDefault = String(draft[s.key]) === String(defaults[s.key]);
              return (
                <div className={`console__row${bad ? ' is-bad' : ''}`} key={s.key}>
                  <div className="console__text">
                    <label htmlFor={id}>{s.label}</label>
                    {s.help && <div id={`${id}-h`} className="field__hint">{s.help}</div>}
                    {changedMeta && <div className="field__hint">{t('con.lastChanged', { by: changedMeta.by, at: new Date(changedMeta.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) })}</div>}
                  </div>
                  <div className="console__control">
                    {s.type === 'bool' && (
                      <button
                        id={id}
                        type="button"
                        role="switch"
                        aria-checked={draft[s.key] === true}
                        className={`switch${draft[s.key] === true ? ' is-on' : ''}`}
                        onClick={() => setDraft((d) => ({ ...d, [s.key]: !(d[s.key] === true) }))}
                      >
                        <span className="switch__knob" aria-hidden="true" />
                        <span className="switch__text">{draft[s.key] === true ? t('con.on') : t('con.off')}</span>
                      </button>
                    )}
                    {s.type === 'enum' && (
                      <select id={id} className="input" value={String(draft[s.key])} aria-describedby={`${id}-h`} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}>
                        {s.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                    {(s.type === 'int' || s.type === 'codes') && (
                      <span className="console__num">
                        <input
                          id={id}
                          className="input"
                          inputMode={s.type === 'int' ? 'numeric' : 'text'}
                          value={String(draft[s.key])}
                          aria-invalid={bad || undefined}
                          aria-describedby={`${id}-h`}
                          onChange={(e) => setDraft((d) => ({ ...d, [s.key]: s.type === 'int' ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^0-9, ]/g, '') }))}
                        />
                        {s.unit && <span className="console__unit">{s.unit}</span>}
                      </span>
                    )}
                    {bad && s.type === 'int' && <div className="field__error">{s.min}–{s.max}</div>}
                    <div className="console__def">
                      {t('con.default', { v: `${show(s.default)}${s.unit ? ' ' + s.unit : ''}` })}
                      {!isDefault && <> · <button type="button" className="link-btn" onClick={() => setDraft((d) => ({ ...d, [s.key]: typeof s.default === 'boolean' ? s.default : String(s.default) }))}>{t('con.reset')}</button></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="console__bar" role="region" aria-label={t('con.title')}>
        {dirty && <span className="console__dirty">{t('con.unsaved')}</span>}
        <button type="button" className="btn btn--primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy && <Spinner />} {t('con.save')}
        </button>
        <button type="button" className="btn btn--secondary" disabled={!dirty || busy} onClick={discard}>{t('con.discard')}</button>
      </div>
    </section>
  );
}
