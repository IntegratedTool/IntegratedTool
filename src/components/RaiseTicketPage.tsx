import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, type TKey } from '../i18n';
import { ApiError, DEFAULT_LIMITS, ticketApi, type CreatedTicket, type NewTicketInput, type TicketMasters } from '../services';
import { errorToMessage } from '../utils/errorMessage';
import { looksLikeAllowedFile } from '../utils/fileCheck';
import { countWords } from '../utils/inputPolicy';
import { matchRoute, routesFor, todayIst, validateNewTicket, type TicketErrorKey } from '../utils/ticketValidation';
import { useSession } from '../session';
import { AccessibleNotification } from './AccessibleNotification';
import { AttachmentPicker, type Slot } from './AttachmentPicker';
import { SelectField, Spinner, TextAreaField, TextField } from './fields';
import { PageTitle } from './PageTitle';

type Form = Omit<NewTicketInput, 'clientRequestId' | 'attachments'>;

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random()}`);

const blank = (): Form => ({
  callerType: '', type: '', source: '', receivedDate: '', name: '', email: '', mobile: '', nature: '', category: '', subCategory: '',
  description: '', arrNumber: '', model2UserId: '', taskTransferDetails: '', brand: '', model: '', serialNumber: '', building: '', room: '', physicalLocation: '',
});

const blankSlots = (n: number): Slot[] => Array.from({ length: n }, (_, i) => ({ id: i, file: null }));

export function RaiseTicketPage() {
  const { t } = useI18n();
  const { user, navigate, endSession } = useSession();
  const [masters, setMasters] = useState<TicketMasters | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // An admin raises on behalf of a caller, so the caller's details start empty; other users get their own details.
  const prefilled = (): Form => user.userType === 'admin' ? blank() : ({ ...blank(), name: user.prefill.name ?? '', email: user.prefill.email ?? '', mobile: user.prefill.mobile ?? '' });
  const [f, setF] = useState<Form>(prefilled);
  const [slots, setSlots] = useState<Slot[]>(blankSlots(2));
  const [errors, setErrors] = useState<Record<string, TicketErrorKey>>({});
  const [formErr, setFormErr] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreatedTicket | null>(null);
  const requestId = useRef(uuid());
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [dup, setDup] = useState<{ number: string; similarity: number; blocked: boolean } | null>(null);
  const lim = masters?.limits ?? DEFAULT_LIMITS;

  const load = () => {
    setLoadFailed(false);
    ticketApi.getMasters().then((m) => {
      setMasters(m);
      setSlots(blankSlots(m.limits?.maxFiles ?? 2));
      if (!m.creator && m.callerTypes[0]) setF((p) => ({ ...p, callerType: m.callerTypes[0].id }));
    }).catch((e) => {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') endSession();
      else setLoadFailed(true);
    });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (attempt === 0) return;
    const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
  }, [attempt]);

  const pool = useMemo(() => (masters ? routesFor(masters, f.callerType) : []), [masters, f.callerType]);
  const natures = useMemo(() => [...new Set(pool.map((r) => r.nature))], [pool]);
  const cats = useMemo(() => [...new Set(pool.filter((r) => r.nature === f.nature).map((r) => r.category))], [pool, f.nature]);
  const subs = useMemo(() => pool.filter((r) => r.nature === f.nature && r.category === f.category && r.subCategory).map((r) => r.subCategory), [pool, f.nature, f.category]);
  const route = masters && f.nature && f.category && (subs.length === 0 || f.subCategory) ? matchRoute(masters, f) : null;
  const fieldSet = route?.fieldSet ?? 'none';

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const err = (k: string) => (errors[k] ? t(errors[k] as TKey, { min: lim.minWords, max: lim.maxWords }) : undefined);
  const words = countWords(f.description);
  const attachments = slots
    .filter((s) => s.file)
    .map((s) => ({ name: s.file!.name, size: s.file!.size, kind: (fieldSet === 'hardware' && s.id === 0 ? 'proof' : 'other') as 'proof' | 'other' }));

  // Changing a parent clears dependent selections and obsolete additional values, so nothing stale is submitted.
  const clearExtras = { arrNumber: '', model2UserId: '', taskTransferDetails: '', brand: '', model: '', serialNumber: '', building: '', room: '', physicalLocation: '' };
  const changeCaller = (v: string) => { setF((p) => ({ ...p, callerType: v, nature: '', category: '', subCategory: '', ...clearExtras })); setErrors({}); };
  const changeNature = (v: string) => { setF((p) => ({ ...p, nature: v, category: '', subCategory: '', ...clearExtras })); setErrors({}); };
  const changeCategory = (v: string) => { setF((p) => ({ ...p, category: v, subCategory: '', ...clearExtras })); setErrors({}); };
  const changeSub = (v: string) => { setF((p) => ({ ...p, subCategory: v, ...clearExtras })); setErrors({}); };

  const pick = async (id: number, file: File | null) => {
    if (!file) return setSlots((s) => s.map((x) => (x.id === id ? { id, file: null } : x)));
    const ok = await looksLikeAllowedFile(file);
    const dupName = lim.blockDuplicateNames && slots.some((x) => x.id !== id && x.file && x.file.name.toLowerCase() === file.name.toLowerCase());
    if (ok && dupName) return setSlots((s) => s.map((x) => (x.id === id ? ({ id, file: null, error: 'err.t.fileDup' } as Slot) : x)));
    setSlots((s) => s.map((x) => (x.id === id ? (ok ? { id, file } : { id, file: null, error: 'err.t.fileType' } as Slot) : x)));
  };

  const reset = () => {
    setF({ ...blank(), callerType: masters && !masters.creator ? masters.callerTypes[0]?.id ?? '' : '' }); // also clears prefilled contact details
    setSlots(blankSlots(lim.maxFiles));
    setErrors({});
    setFormErr(null);
    setDup(null);
    requestId.current = uuid();
  };

  const submit = async (ev: React.FormEvent, confirmed = false) => {
    ev.preventDefault();
    if (busy || !masters) return;
    setFormErr(null);
    if (!confirmed) setDup(null);
    const input: NewTicketInput = { ...f, clientRequestId: requestId.current, attachments, ...(confirmed ? { confirmNotDuplicate: true } : {}) };
    const e = validateNewTicket(input, masters);
    setErrors(e);
    setAttempt((n) => n + 1);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      setDone(await ticketApi.createTicket(input, slots.flatMap((x) => (x.file ? [x.file] : []))));
    } catch (x) {
      if (x instanceof ApiError && x.code === 'UNAUTHENTICATED') return endSession();
      if (x instanceof ApiError && x.code === 'DUPLICATE_SUSPECTED') {
        setDup({ number: String(x.meta.number ?? ''), similarity: Number(x.meta.similarity ?? 0), blocked: Number(x.meta.blocked ?? 0) === 1 });
      } else if (x instanceof ApiError && x.code === 'VALIDATION' && x.meta.field) {
        setErrors({ [String(x.meta.field)]: (x.meta.code as TicketErrorKey) ?? 'err.t.required' });
        setAttempt((n) => n + 1);
      } else setFormErr(errorToMessage(x).key);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section aria-labelledby="page-title">
        <PageTitle>{t('nav.raise')}</PageTitle>
        <div className="form">
          <AccessibleNotification kind="success">{t('raise.success', { number: done.number })}</AccessibleNotification>
          {done.assigneeName && <p>{t('raise.assignedTo', { name: done.assigneeName })}</p>}
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={() => navigate({ name: 'ticket', number: done.number })}>
              {t('raise.viewTicket')}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => { reset(); setF({ ...prefilled(), callerType: masters && !masters.creator ? masters.callerTypes[0]?.id ?? '' : '' }); setDone(null); }}>
              {t('raise.another')}
            </button>
            <button type="button" className="link-btn" onClick={() => navigate({ name: 'list', list: 'mine' })}>
              {t('raise.toList')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (loadFailed)
    return (
      <section>
        <PageTitle>{t('nav.raise')}</PageTitle>
        <AccessibleNotification kind="error">{t('raise.mastersError')}</AccessibleNotification>
        <button type="button" className="btn btn--secondary" onClick={load}>{t('btn.retry')}</button>
      </section>
    );
  if (!masters)
    return (
      <section>
        <PageTitle>{t('nav.raise')}</PageTitle>
        <p><Spinner /> {t('list.loading')}</p>
      </section>
    );

  const sel = (label: TKey, k: keyof Form, opts: { id: string; label: string }[], extra: { disabled?: boolean; onChange?: (v: string) => void } = {}) => (
    <SelectField label={t(label)} required value={f[k] as string} disabled={extra.disabled} error={err(k)} onChange={(e) => (extra.onChange ?? ((v: string) => set(k, v as never)))(e.target.value)}>
      <option value="">{t('f.select')}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </SelectField>
  );
  const strs = (a: string[]) => a.map((x) => ({ id: x, label: x }));
  const txt = (label: TKey, k: keyof Form, o: { hint?: string; type?: string; inputMode?: 'numeric'; max?: number; required?: boolean } = {}) => (
    <TextField label={t(label)} required={o.required ?? true} value={f[k] as string} type={o.type} inputMode={o.inputMode} maxLength={o.max} hint={o.hint} error={err(k)} onChange={(e) => set(k, e.target.value as never)} />
  );

  return (
    <section aria-labelledby="page-title">
      <PageTitle>{t('nav.raise')}</PageTitle>
      <p className="field__hint">{t('raise.intro')} {masters.isSample && t('raise.sample')}</p>
      <form ref={formRef} className="form" onSubmit={submit} onReset={(e) => { e.preventDefault(); reset(); }} noValidate>
        {formErr && <AccessibleNotification kind="error">{t(formErr)}</AccessibleNotification>}

        <fieldset className="group">
          <legend>{t('sec.general')}</legend>
          <div className="form-grid">
            {masters.creator && (
              <>
                {sel('f.callerType', 'callerType', masters.callerTypes, { onChange: changeCaller })}
                {sel('f.type', 'type', masters.types)}
                {sel('f.source', 'source', masters.sources)}
                <TextField label={t('f.received')} required type="date" max={todayIst()} value={f.receivedDate} error={err('receivedDate')} onChange={(e) => set('receivedDate', e.target.value)} />
              </>
            )}
            <div className="span-2">{txt('f.name', 'name', { max: 120 })}</div>
            {txt('f.email', 'email', { type: 'email', hint: masters.creator ? undefined : t('f.contactNote') })}
            <TextField label={t('f.mobile')} value={f.mobile} inputMode="numeric" maxLength={10} error={err('mobile')} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} />
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>{t('sec.issue')}</legend>
          <div className="form-grid">
            {sel('f.nature', 'nature', strs(natures), { disabled: masters.creator && !f.callerType, onChange: changeNature })}
            {sel('f.category', 'category', strs(cats), { disabled: !f.nature, onChange: changeCategory })}
            {subs.length > 0 && sel('f.subcategory', 'subCategory', strs(subs), { onChange: changeSub })}
          </div>
        </fieldset>

        {fieldSet !== 'none' && (
          <fieldset className="group">
            <legend>{t('sec.additional')}</legend>
            <div className="form-grid">
              {fieldSet === 'gst' && txt('f.arr', 'arrNumber')}
              {fieldSet === 'task' && (
                <>
                  {txt('f.model2', 'model2UserId', { hint: t('f.model2Hint') })}
                  <div className="span-2">
                    <TextAreaField label={t('f.taskDetails')} required value={f.taskTransferDetails} error={err('taskTransferDetails')} onChange={(e) => set('taskTransferDetails', e.target.value)} />
                  </div>
                </>
              )}
              {fieldSet === 'hardware' && (<>{txt('f.brand', 'brand')}{txt('f.model', 'model')}{txt('f.serial', 'serialNumber')}</>)}
              {fieldSet === 'network' && (<>{txt('f.building', 'building')}{txt('f.room', 'room')}<div className="span-2">{txt('f.physical', 'physicalLocation', { hint: t('f.physicalHint') })}</div></>)}
            </div>
          </fieldset>
        )}

        <fieldset className="group">
          <legend>{t('sec.description')}</legend>
          <TextAreaField
            label={t('f.description')}
            required
            rows={7}
            value={f.description}
            error={err('description')}
            hint={<span aria-live="polite" className={words > lim.maxWords || (words > 0 && words < lim.minWords) ? 'words is-bad' : 'words'}>{t('words.count', { n: words, min: lim.minWords, max: lim.maxWords })}</span>}
            onChange={(e) => set('description', e.target.value)}
          />
          {dup && (
            <div className="dup" role="alert">
              <strong>{t('raise.dupTitle')}</strong>
              <p>{t('raise.dupBody', { number: dup.number, similarity: dup.similarity })}</p>
              <div className="actions">
                <button type="button" className="btn btn--secondary" onClick={() => navigate({ name: 'ticket', number: dup.number })}>{t('raise.dupOpen', { number: dup.number })}</button>
                {!dup.blocked && <button type="button" className="btn btn--primary" disabled={busy} onClick={(e) => void submit(e, true)}>{t('raise.dupConfirm')}</button>}
              </div>
              {dup.blocked && <p className="field__hint">{t('raise.dupBlocked')}</p>}
            </div>
          )}
        </fieldset>

        <AttachmentPicker limits={lim} slots={slots} proofRequired={fieldSet === 'hardware'} error={err('attachments')} onPick={(id, file) => void pick(id, file)} />

        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy && <Spinner />} {busy ? t('btn.submitting') : t('btn.submit')}
          </button>
          <button type="reset" className="btn btn--secondary" disabled={busy}>{t('btn.reset')}</button>
          <button type="button" className="link-btn" onClick={() => navigate({ name: 'dashboard' })}>{t('btn.back')}</button>
        </div>
      </form>
    </section>
  );
}
