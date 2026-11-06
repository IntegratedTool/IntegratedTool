import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { ApiError, adminApi, emptyReportFilters, STATUSES, type CountRow, type ReportFilters, type ReportSummary } from '../services';
import { useSession } from '../session';
import { AccessibleNotification } from './AccessibleNotification';
import { SelectField, Spinner } from './fields';
import { PageTitle } from './PageTitle';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Bars({ rows, label }: { rows: CountRow[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bars__label" title={r.label}>{r.label}</span>
          <span className="bars__track" aria-hidden="true"><span className="bars__fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="bars__n">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function MonthChart({ data, a, b, la, lb }: { data: ReportSummary['byMonth']; a: 'created'; b: 'resolved'; la: string; lb: string }) {
  const W = 640, H = 220, L = 34, B = 24, T = 10;
  const max = Math.max(1, ...data.flatMap((d) => [d[a], d[b]]));
  const bw = (W - L) / 12;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${la} / ${lb}`} preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((g) => (
          <g key={g}><line x1={L} x2={W} y1={y(max * g)} y2={y(max * g)} className="chart__grid" /><text x={L - 6} y={y(max * g) + 4} textAnchor="end" className="chart__tick">{Math.round(max * g)}</text></g>
        ))}
        {data.map((d, i) => (
          <g key={d.month}>
            <rect x={L + i * bw + bw * 0.12} width={bw * 0.36} y={y(d[a])} height={H - B - y(d[a])} className="chart__a" />
            <rect x={L + i * bw + bw * 0.5} width={bw * 0.36} y={y(d[b])} height={H - B - y(d[b])} className="chart__b" />
            <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="chart__tick">{MONTHS[d.month - 1]}</text>
          </g>
        ))}
      </svg>
      <figcaption className="chart__legend"><span><i className="chart__a" /> {la}</span><span><i className="chart__b" /> {lb}</span></figcaption>
      <details>
        <summary>Table</summary>
        <table className="table"><thead><tr><th>Month</th><th>{la}</th><th>{lb}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.month}><td>{MONTHS[d.month - 1]}</td><td>{d.created}</td><td>{d.resolved}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

export function ReportsPage() {
  const { t } = useI18n();
  const { endSession } = useSession();
  const [f, setF] = useState<ReportFilters>(emptyReportFilters());
  const [r, setR] = useState<ReportSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    adminApi.getReport(f).then((x) => { if (live) setR(x); }).catch((e) => {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') endSession(); else if (live) setFailed(true);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<ReportFilters>) => setF((x) => ({ ...x, ...p, ...(p.year === null ? { month: null } : {}) }));
  const url = useMemo(() => adminApi.exportUrl(f), [f]);
  const tot = r?.totals;

  const kpi = (label: string, v: string | number) => (<div className="kpi"><div className="kpi__v">{v}</div><div className="kpi__l">{label}</div></div>);

  return (
    <section aria-labelledby="page-title" className="reports">
      <PageTitle>{t('rep.title')}</PageTitle>
      <p className="field__hint">{t('rep.intro')}</p>
      <div className="filters" role="group" aria-label={t('rep.title')}>
        <SelectField label={t('rep.wing')} value={f.wing} onChange={(e) => set({ wing: e.target.value })}>
          <option value="">{t('rep.all')}</option>
          {(r?.wings ?? []).map((w) => <option key={w} value={w}>{w}</option>)}
        </SelectField>
        <SelectField label={t('rep.year')} value={f.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('rep.allYears')}</option>
          {(r?.years ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
        </SelectField>
        <SelectField label={t('rep.month')} value={f.month ?? ''} disabled={f.year === null} onChange={(e) => set({ month: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('rep.all')}</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </SelectField>
        <SelectField label={t('rep.caller')} value={f.caller} onChange={(e) => set({ caller: e.target.value })}>
          <option value="">{t('rep.all')}</option>
          {(r?.callers ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <div className="filters__actions">
          <a className="btn btn--secondary" href={url} download>{t('rep.export')}</a>
          <button type="button" className="btn btn--secondary" onClick={() => window.print()}>{t('rep.print')}</button>
        </div>
      </div>

      {failed && <AccessibleNotification kind="error">{t('rep.error')}</AccessibleNotification>}
      {loading && !r && <p><Spinner /> {t('rep.loading')}</p>}
      {r && tot && (
        <div aria-busy={loading} className={loading ? 'is-loading' : undefined}>
          {tot.total === 0 ? <AccessibleNotification kind="info">{t('rep.none')}</AccessibleNotification> : null}
          <div className="kpis">
            {kpi(t('rep.total'), tot.total)}
            {kpi(t('rep.open'), tot.open)}
            {kpi(t('rep.resolved'), tot.byStatus.resolved ?? 0)}
            {kpi(t('rep.closed'), tot.byStatus.closed ?? 0)}
            {kpi(t('rep.withdrawn'), tot.byStatus.withdrawn ?? 0)}
            {kpi(t('rep.reopened'), tot.reopened)}
            {kpi(t('rep.avg'), tot.avgResolutionHours === null ? t('rep.na') : t('rep.hours', { n: tot.avgResolutionHours }))}
          </div>

          <div className="card-lite">
            <h3>{t('rep.monthly', { year: r.chartYear })}</h3>
            <MonthChart data={r.byMonth} a="created" b="resolved" la={t('rep.created')} lb={t('rep.resolvedL')} />
          </div>

          <div className="reports__grid">
            <div className="card-lite"><h3>{t('rep.byStatus')}</h3><Bars label={t('rep.byStatus')} rows={STATUSES.map((s) => ({ label: t(`status.${s}` as never), count: tot.byStatus[s] ?? 0 }))} /></div>
            <div className="card-lite"><h3>{t('rep.aging')}</h3><Bars label={t('rep.aging')} rows={r.aging} /></div>
            <div className="card-lite"><h3>{t('rep.byWing')}</h3><Bars label={t('rep.byWing')} rows={r.byWing} /></div>
            <div className="card-lite"><h3>{t('rep.byCaller')}</h3><Bars label={t('rep.byCaller')} rows={r.byCaller} /></div>
            <div className="card-lite"><h3>{t('rep.byNature')}</h3><Bars label={t('rep.byNature')} rows={r.byNature} /></div>
            <div className="card-lite"><h3>{t('rep.byCategory')}</h3><Bars label={t('rep.byCategory')} rows={r.byCategory} /></div>
          </div>

          <div className="card-lite">
            <h3>{t('rep.assignee')}</h3>
            <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>{t('rep.cOpen')}</th><th>{t('rep.cDone')}</th></tr></thead>
              <tbody>{r.byAssignee.map((a) => <tr key={a.name}><td>{a.name}</td><td>{a.open}</td><td>{a.done}</td></tr>)}</tbody></table></div>
          </div>
          <p className="field__hint">{t('rep.generated', { time: new Date(r.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) })}</p>
        </div>
      )}
    </section>
  );
}
