import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useI18n, type TKey } from '../i18n';
import { ApiError, ticketApi, type Option, type TicketAction, type TicketDetail } from '../services';
import { errorToMessage } from '../utils/errorMessage';
import { fmtDate, fmtDateTime, kb } from '../utils/format';
import { useSession } from '../session';
import { AccessibleNotification } from './AccessibleNotification';
import { Dialog } from './Dialog';
import { SelectField, Spinner, TextAreaField } from './fields';
import { PageTitle } from './PageTitle';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';

type Dlg = null | 'hold' | 'resolve' | 'reopen' | 'withdraw' | 'close' | 'send' | 'reassign';

const DLG: Record<Exclude<Dlg, null>, { title: TKey; label: TKey; confirm: TKey; body?: TKey; danger?: boolean }> = {
  hold: { title: 'dlg.hold.title', label: 'dlg.hold.label', confirm: 'dlg.hold.confirm' },
  resolve: { title: 'dlg.resolve.title', label: 'dlg.resolve.label', confirm: 'dlg.resolve.confirm' },
  reopen: { title: 'dlg.reopen.title', label: 'dlg.reopen.label', confirm: 'dlg.reopen.confirm', body: 'dlg.reopen.body' },
  withdraw: { title: 'dlg.withdraw.title', label: 'dlg.withdraw.label', confirm: 'dlg.withdraw.confirm', body: 'dlg.withdraw.body', danger: true },
  close: { title: 'dlg.close.title', label: 'dlg.close.label', confirm: 'dlg.close.confirm', body: 'dlg.close.body' },
  send: { title: 'dlg.send.title', label: 'dlg.send.label', confirm: 'dlg.send.confirm', body: 'dlg.send.body' },
  reassign: { title: 'dlg.reassign.title', label: 'dlg.reassign.label', confirm: 'dlg.reassign.confirm', body: 'dlg.reassign.body' },
};

function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="dl">
      {items.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TicketDetailPage({ number, backTo }: { number: string; backTo: () => void }) {
  const { t, locale } = useI18n();
  const { endSession } = useSession();
  const [d, setD] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<TKey | null>(null);
  const [notice, setNotice] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [text, setText] = useState('');
  const [textErr, setTextErr] = useState(false);
  const [remark, setRemark] = useState('');
  const [remarkErr, setRemarkErr] = useState(false);
  const [comment, setComment] = useState('');
  const [commentErr, setCommentErr] = useState(false);
  const [targets, setTargets] = useState<Option[]>([]);
  const [target, setTarget] = useState('');

  const load = useCallback(() => {
    return ticketApi.getTicket(number).then((x) => { setD(x); setError(null); }).catch((e) => {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') endSession();
      else setError(errorToMessage(e).key);
    });
  }, [number, endSession]);
  useEffect(() => { setD(null); void load(); }, [load]);

  const run = async (a: TicketAction, closeDialog = true) => {
    if (!d || busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const res = await ticketApi.act(d.number, d.status, a);
      if (res === null) {
        // Access moved with the assignment: back to the list with an explanation.
        backTo();
        return true;
      }
      setD(res);
      if (closeDialog) setDlg(null);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') endSession();
      else if (e instanceof ApiError && e.code === 'INVALID_STATE') {
        setDlg(null);
        setNotice('err.t.stale');
        await load(); // refresh to the latest stored state
      } else if (e instanceof ApiError && e.code === 'VALIDATION') {
        if (a.type === 'remark') setRemarkErr(true); else if (a.type === 'comment') setCommentErr(true); else setTextErr(true);
      } else {
        setDlg(null);
        setNotice(errorToMessage(e).key);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const open = async (k: Exclude<Dlg, null>) => {
    setText('');
    setTextErr(false);
    setTarget('');
    setDlg(k);
    if (k === 'send' || k === 'reassign') ticketApi.getReassignTargets().then((x) => setTargets(x)).catch(() => setTargets([]));
  };

  const confirm = async () => {
    if (!dlg) return;
    if (!text.trim() && dlg !== 'close') return setTextErr(true); // a closing remark is optional
    const r = text.trim();
    let a: TicketAction;
    switch (dlg) {
      case 'hold': a = { type: 'hold', reason: r }; break;
      case 'resolve': a = { type: 'resolve', details: r }; break;
      case 'reopen': a = { type: 'reopen', reason: r }; break;
      case 'withdraw': a = { type: 'withdraw', reason: r }; break;
      case 'close': a = { type: 'close', remark: r }; break;
      case 'send': a = { type: 'sendToHelpdesk', reason: r }; break;
      default:
        if (!target) return;
        a = { type: 'reassign', assigneeId: target, reason: r };
    }
    await run(a);
  };

  if (error)
    return (
      <section>
        <PageTitle>{number}</PageTitle>
        <AccessibleNotification kind="error">{t(error)}</AccessibleNotification>
        <button type="button" className="btn btn--secondary" onClick={backTo}>{t('det.back')}</button>
      </section>
    );
  if (!d)
    return (
      <section>
        <PageTitle>{number}</PageTitle>
        <p><Spinner /> {t('det.loading')}</p>
      </section>
    );

  const a = d.actions;
  const any = Object.values(a).some(Boolean);
  const actorRole = (r: string) => t(`actor.${r}` as TKey);
  const ex = d.extra;

  return (
    <section aria-labelledby="page-title">
      <PageTitle>{d.number}</PageTitle>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button type="button" className="link-btn" onClick={backTo}>← {t('det.back')}</button>
        <StatusBadge status={d.status} />
        {d.originalOrTransferred && <span className="badge">{t(`ot.${d.originalOrTransferred}`)}</span>}
      </div>
      <StatusTimeline status={d.status} />
      {notice && <AccessibleNotification kind="warn">{t(notice)}</AccessibleNotification>}

      <div className="card-lite">
        <h3>{t('det.details')}</h3>
        <Dl items={[
          [t('f.callerType'), d.callerType],
          [t('f.type'), d.typeLabel ?? ''],
          [t('f.source'), d.sourceLabel ?? ''],
          [t('f.received'), d.receivedDate ? fmtDate(d.receivedDate, locale) : ''],
          [t('det.raisedBy'), d.creatorName],
          [t('det.createdOn'), fmtDateTime(d.createdAt, locale)],
          [t('det.assignedTo'), d.assigneeName ?? ''],
          [t('det.wing'), d.wing],
          [t('f.nature'), d.nature],
          [t('f.category'), d.category],
          [t('f.subcategory'), d.subCategory],
          [t('f.arr'), ex.arrNumber ?? ''],
          [t('f.model2'), ex.model2UserId ?? ''],
          [t('f.taskDetails'), ex.taskTransferDetails ?? ''],
          [t('f.brand'), ex.brand ?? ''],
          [t('f.model'), ex.model ?? ''],
          [t('f.serial'), ex.serialNumber ?? ''],
          [t('f.building'), ex.building ?? ''],
          [t('f.room'), ex.room ?? ''],
          [t('f.physical'), ex.physicalLocation ?? ''],
        ]} />
        <h4>{t('det.complainant')}</h4>
        <Dl items={[[t('f.name'), d.complainant.name], [t('f.email'), d.complainant.email], [t('f.mobile'), d.complainant.mobile]]} />
        <h4>{t('f.description')}</h4>
        <p className="prewrap">{d.description}</p>
        <h4>{t('det.attach')}</h4>
        {d.attachments.length === 0 ? <p>{t('det.noAttach')}</p> : (
          <>
            <ul className="plain">
              {d.attachments.map((x, i) => <li key={i}>{x.kind === 'proof' && <strong>{t('att.proof')}: </strong>}{x.name} ({kb(x.size)})</li>)}
            </ul>
            <p className="field__hint">{t('det.attachNote')}</p>
          </>
        )}
      </div>

      <div className="card-lite">
        <h3>{t('act.title')}</h3>
        {!any && <p>{t('act.none')}</p>}
        {d.reopenUntil && a.reopen && <p className="field__hint">{t('act.reopenUntil', { date: fmtDateTime(d.reopenUntil, locale) })}</p>}
        {d.autoClosesOn && <p className="field__hint">{t('act.autoClose', { date: fmtDateTime(d.autoClosesOn, locale) })}</p>}
        <div className="actions">
          {a.start && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run({ type: 'start' })}>{busy && <Spinner />} {t('act.start')}</button>}
          {a.hold && <button type="button" className="btn btn--secondary" onClick={() => void open('hold')}>{t('act.hold')}</button>}
          {a.resume && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run({ type: 'resume' })}>{t('act.resume')}</button>}
          {a.resolve && <button type="button" className="btn btn--primary" onClick={() => void open('resolve')}>{t('act.resolve')}</button>}
          {a.sendToHelpdesk && <button type="button" className="btn btn--secondary" onClick={() => void open('send')}>{t('act.send')}</button>}
          {a.reassign && <button type="button" className="btn btn--secondary" onClick={() => void open('reassign')}>{t('act.reassign')}</button>}
          {a.reopen && <button type="button" className="btn btn--primary" onClick={() => void open('reopen')}>{t('act.reopen')}</button>}
          {a.withdraw && <button type="button" className="btn btn--danger" onClick={() => void open('withdraw')}>{t('act.withdraw')}</button>}
          {a.close && <button type="button" className="btn btn--primary" onClick={() => void open('close')}>{t('act.close')}</button>}
        </div>
        {a.remark && (
          <form className="form" style={{ marginTop: 16 }} noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (!remark.trim()) return setRemarkErr(true);
            setRemarkErr(false);
            if (await run({ type: 'remark', text: remark.trim() }, false)) setRemark('');
          }}>
            <TextAreaField label={t('act.remark')} required value={remark} error={remarkErr ? t('err.t.reason') : undefined} onChange={(e) => setRemark(e.target.value)} />
            <div className="actions"><button type="submit" className="btn btn--primary" disabled={busy}>{busy && <Spinner />} {t('act.remarkSubmit')}</button></div>
          </form>
        )}
        {a.comment && (
          <form className="form" style={{ marginTop: 16 }} noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (!comment.trim()) return setCommentErr(true);
            setCommentErr(false);
            if (await run({ type: 'comment', text: comment.trim() }, false)) setComment('');
          }}>
            <TextAreaField label={t('act.comment')} required hint={t('act.commentHint')} value={comment} error={commentErr ? t('err.t.reason') : undefined} onChange={(e) => { setComment(e.target.value); setCommentErr(false); }} />
            <div className="actions"><button type="submit" className="btn btn--secondary" disabled={busy}>{busy && <Spinner />} {t('act.commentSubmit')}</button></div>
          </form>
        )}
      </div>

      <div className="card-lite">
        <h3>{t('det.history')}</h3>
        <p className="field__hint">{t('hist.latestFirst')}</p>
        {d.history.length === 0 ? <p>{t('det.noActions')}</p> : (
          <div className="table-wrap" role="region" aria-label={t('det.history')} tabIndex={0}>
            <table className="table">
              <thead><tr><th scope="col">{t('col.sno')}</th><th scope="col">{t('hist.date')}</th><th scope="col">{t('hist.action')}</th><th scope="col">{t('hist.by')}</th></tr></thead>
              <tbody>
                {d.history.map((h, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{fmtDateTime(h.at, locale)}</td>
                    <td><strong>{t(`ev.${h.kind}` as TKey)}</strong>{h.text && <span className="prewrap">: {h.text}</span>}</td>
                    <td>{h.byRole === 'system' ? actorRole('system') : `${h.byName} (${actorRole(h.byRole)})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {d.assignmentHistory && (
        <div className="card-lite">
          <h3>{t('det.assignHistory')}</h3>
          {d.assignmentHistory.length === 0 ? <p>{t('det.noAssign')}</p> : (
            <div className="table-wrap" role="region" aria-label={t('det.assignHistory')} tabIndex={0}>
              <table className="table">
                <thead><tr><th scope="col">{t('col.sno')}</th><th scope="col">{t('hist.date')}</th><th scope="col">{t('hist.action')}</th><th scope="col">{t('hist.by')}</th></tr></thead>
                <tbody>
                  {d.assignmentHistory.map((h, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{fmtDateTime(h.at, locale)}</td>
                      <td><strong>{t(`ev.${h.kind}` as TKey)}</strong>{(h.fromName || h.toName) && ` (${h.fromName ?? '—'} → ${h.toName ?? '—'})`}{h.text && <span className="prewrap">: {h.text}</span>}</td>
                      <td>{h.byRole === 'system' ? actorRole('system') : `${h.byName} (${actorRole(h.byRole)})`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dlg && (
        <Dialog title={t(DLG[dlg].title)} onClose={() => !busy && setDlg(null)}>
          <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
            {DLG[dlg].body && <p>{t(DLG[dlg].body!)}</p>}
            {dlg === 'reassign' && (
              <SelectField label={t('dlg.reassign.to')} required value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{t('f.select')}</option>
                {targets.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </SelectField>
            )}
            <TextAreaField label={t(DLG[dlg].label)} required value={text} error={textErr ? t('err.t.reason') : undefined} onChange={(e) => { setText(e.target.value); setTextErr(false); }} />
            <div className="actions">
              <button type="submit" className={`btn ${DLG[dlg].danger ? 'btn--danger' : 'btn--primary'}`} disabled={busy || (dlg === 'reassign' && !target)}>{busy && <Spinner />} {t(DLG[dlg].confirm)}</button>
              <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setDlg(null)}>{t('dlg.cancel')}</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
