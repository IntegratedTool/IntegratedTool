import { useEffect, useMemo, useState } from 'react';
import { useI18n, type TKey } from '../i18n';
import { ApiError, emptyFilters, ticketApi, type FilterOptions, type ListKind, type TicketFilters, type TicketPage } from '../services';
import { fmtDate } from '../utils/format';
import { useSession } from '../session';
import { AccessibleNotification } from './AccessibleNotification';
import { SelectField, Spinner, TextField } from './fields';
import { PageTitle } from './PageTitle';
import { Pagination } from './Pagination';
import { AgeChip } from './AgeChip';
import { StatusBadge } from './StatusBadge';

export interface ListState {
  filters: TicketFilters;
  page: number;
}
export const initialListState = (): ListState => ({ filters: emptyFilters(), page: 1 });

const TITLE: Record<ListKind, TKey> = {
  mine: 'nav.mine',
  'assigned-new': 'nav.new',
  'assigned-inprogress': 'nav.inprogress',
  'assigned-onhold': 'nav.onhold',
  'assigned-resolved': 'nav.resolved',
  'assigned-closed': 'nav.closed',
  'assigned-reopened': 'nav.reopened',
  helpdesk: 'nav.helpdesk',
  closure: 'nav.closure',
};
const LOCK: Partial<Record<ListKind, string>> = {
  'assigned-new': 'new', 'assigned-inprogress': 'inprogress', 'assigned-onhold': 'onhold', 'assigned-resolved': 'resolved', 'assigned-closed': 'closed', closure: 'resolved',
};

interface Props {
  list: ListKind;
  state: ListState;
  onState: (s: ListState) => void;
}

export function TicketListPage({ list, state, onState }: Props) {
  const { t, locale } = useI18n();
  const { user, navigate, endSession } = useSession();
  const [opts, setOpts] = useState<FilterOptions>({ assignees: [], classes: [] });
  const [draft, setDraft] = useState<TicketFilters>(state.filters);
  const [data, setData] = useState<TicketPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const lock = LOCK[list];
  const canSeeOT = user.capabilities.viewAssignmentHistory;
  const canSeeAssignee = user.capabilities.assignedTickets || user.capabilities.closeCases;

  useEffect(() => setDraft(state.filters), [list]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ticketApi.getFilterOptions(list).then(setOpts).catch(() => setOpts({ assignees: [], classes: [] }));
  }, [list]);

  const load = () => {
    setLoading(true);
    setFailed(false);
    ticketApi
      .listTickets(list, state.filters, state.page)
      .then(setData)
      .catch((e) => (e instanceof ApiError && e.code === 'UNAUTHENTICATED' ? endSession() : setFailed(true)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [list, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const natures = useMemo(() => [...new Set(opts.classes.map((c) => c.nature))].sort(), [opts]);
  const cats = useMemo(() => [...new Set(opts.classes.filter((c) => c.nature === draft.nature).map((c) => c.category))].sort(), [opts, draft.nature]);
  const set = <K extends keyof TicketFilters>(k: K, v: TicketFilters[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    onState({ filters: draft, page: 1 });
  };
  const reset = () => {
    // Status-specific lists keep their locked status; reopened/helpdesk lists keep their own conditions (server side).
    setDraft(emptyFilters());
    onState({ filters: emptyFilters(), page: 1 });
  };

  const showReopenedCol = list === 'assigned-reopened' || (list === 'mine' && state.filters.reopenedOnly);
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? from + data.items.length - 1 : 0;

  return (
    <section aria-labelledby="page-title">
      <PageTitle>{t(TITLE[list])}</PageTitle>
      {list === 'assigned-reopened' && <p className="field__hint">{t('list.reopenedNote')}</p>}
      {list === 'helpdesk' && <p className="field__hint">{t('list.helpdeskNote')}</p>}
      {list === 'closure' && <p className="field__hint">{t('list.closureNote')}</p>}

      <form className="filters" onSubmit={apply} aria-label={t('filter.title')}>
        <div className="filters__grid">
          <TextField label={t('filter.number')} value={draft.number} onChange={(e) => set('number', e.target.value)} autoComplete="off" />
          <SelectField label={t('f.nature')} value={draft.nature} onChange={(e) => setDraft((d) => ({ ...d, nature: e.target.value, category: '' }))}>
            <option value="">{t('f.all')}</option>
            {natures.map((n) => <option key={n} value={n}>{n}</option>)}
          </SelectField>
          <SelectField label={t('f.category')} value={draft.category} disabled={!draft.nature} onChange={(e) => set('category', e.target.value)}>
            <option value="">{t('f.all')}</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          {lock ? (
            <SelectField label={t('filter.statusFixed')} value={lock} disabled onChange={() => undefined}>
              <option value={lock}>{t(`status.${lock}` as TKey)}</option>
            </SelectField>
          ) : (
            <SelectField label={t('col.status')} value={draft.status} onChange={(e) => set('status', e.target.value as TicketFilters['status'])}>
              <option value="">{t('f.all')}</option>
              {(['new', 'inprogress', 'onhold', 'resolved', 'closed', 'withdrawn'] as const)
                .filter((s) => list !== 'helpdesk' || s === 'new' || s === 'inprogress' || s === 'onhold')
                .map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </SelectField>
          )}
          {opts.assignees.length > 1 && (
            <SelectField label={t('col.assigned')} value={draft.assignee} onChange={(e) => set('assignee', e.target.value)}>
              <option value="">{t('f.all')}</option>
              {opts.assignees.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </SelectField>
          )}
          {list === 'mine' && (
            <SelectField label={t('filter.reopened')} value={draft.reopenedOnly ? 'yes' : ''} onChange={(e) => set('reopenedOnly', e.target.value === 'yes')}>
              <option value="">{t('filter.reopenedAll')}</option>
              <option value="yes">{t('filter.reopenedOnly')}</option>
            </SelectField>
          )}
          {canSeeOT && (
            <SelectField label={t('filter.ot')} value={draft.originalTransferred} onChange={(e) => set('originalTransferred', e.target.value as TicketFilters['originalTransferred'])}>
              <option value="">{t('f.all')}</option>
              <option value="original">{t('ot.original')}</option>
              <option value="transferred">{t('ot.transferred')}</option>
            </SelectField>
          )}
        </div>
        <div className="actions">
          <button type="submit" className="btn btn--primary">{t('filter.apply')}</button>
          <button type="button" className="btn btn--secondary" onClick={reset}>{t('filter.reset')}</button>
        </div>
      </form>

      <div aria-live="polite" className="list-status">
        {loading && <span><Spinner /> {t('list.loading')}</span>}
        {!loading && data && data.total > 0 && <span>{t('list.count', { from, to, total: data.total })}</span>}
      </div>
      {failed && (
        <div className="form">
          <AccessibleNotification kind="error">{t('list.error')}</AccessibleNotification>
          <button type="button" className="btn btn--secondary" onClick={load}>{t('btn.retry')}</button>
        </div>
      )}
      {!failed && data && data.total === 0 && !loading && <AccessibleNotification kind="info">{t('list.empty')}</AccessibleNotification>}
      {!failed && data && data.total > 0 && (
        <div className="table-wrap" role="region" aria-label={t(TITLE[list])} tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('col.sno')}</th>
                <th scope="col">{t('col.number')}</th>
                <th scope="col">{t('col.nature')}</th>
                <th scope="col">{t('col.category')}</th>
                <th scope="col">{t('col.subcategory')}</th>
                <th scope="col">{t('col.status')}</th>
                {canSeeAssignee && <th scope="col">{t('col.assigned')}</th>}
                <th scope="col">{t('col.created')}</th>
                <th scope="col">{t('col.age')}</th>
                {showReopenedCol && <th scope="col">{t('col.reopened')}</th>}
                {canSeeOT && <th scope="col">{t('col.ot')}</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((r, i) => (
                <tr key={r.number}>
                  <td>{from + i}</td>
                  <th scope="row">
                    <a href={`#/ticket/${encodeURIComponent(r.number)}`} onClick={(e) => { e.preventDefault(); navigate({ name: 'ticket', number: r.number }); }}>{r.number}</a>
                  </th>
                  <td>{r.nature}</td>
                  <td>{r.category}</td>
                  <td>{r.subCategory || '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  {canSeeAssignee && <td>{r.assigneeName ?? '—'}</td>}
                  <td>{fmtDate(r.createdAt, locale)}</td>
                  <td><AgeChip createdAt={r.createdAt} status={r.status} /></td>
                  {showReopenedCol && <td>{r.lastReopenedAt ? fmtDate(r.lastReopenedAt, locale) : '—'}</td>}
                  {canSeeOT && <td>{r.originalOrTransferred ? t(`ot.${r.originalOrTransferred}`) : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={(p) => onState({ ...state, page: p })} />}
    </section>
  );
}
