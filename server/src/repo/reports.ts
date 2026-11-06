import type { Queryable } from '../dbAdapter.js';
import type { ReportFilters, ReportSummary } from '../../../src/services/adminTypes.js';
import type { TicketStatus } from '../../../src/services/ticketTypes.js';

const TZ = `'Asia/Kolkata'`;
const OPEN = `('new','inprogress','onhold')`;

export function cleanFilters(q: Record<string, unknown>): ReportFilters {
  const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string).trim().slice(0, 50) : '');
  const year = /^\d{4}$/.test(s('year')) ? Number(s('year')) : null;
  const month = year !== null && /^\d{1,2}$/.test(s('month')) && Number(s('month')) >= 1 && Number(s('month')) <= 12 ? Number(s('month')) : null;
  return { wing: s('wing'), caller: s('caller'), year, month };
}

const where = (f: ReportFilters, withDate = true) => ({
  sql: `($1 = '' or t.wing = $1) and ($2 = '' or t.authenticator = $2)` +
    (withDate ? ` and ($3::int is null or extract(year from t.created_at at time zone ${TZ}) = $3::int) and ($4::int is null or extract(month from t.created_at at time zone ${TZ}) = $4::int)` : ''),
  params: (withDate ? [f.wing, f.caller, f.year, f.month] : [f.wing, f.caller]) as unknown[],
});

const rows = async <T>(q: Queryable, sql: string, params: unknown[]) => (await q.query<T>(sql, params)).rows;

export async function summaryReport(q: Queryable, f: ReportFilters): Promise<ReportSummary> {
  const W = where(f);
  const byStatus: Record<TicketStatus, number> = { new: 0, inprogress: 0, onhold: 0, resolved: 0, closed: 0, withdrawn: 0 };
  for (const r of await rows<{ status: TicketStatus; n: string }>(q, `select t.status, count(*) n from hd_ticket t where ${W.sql} group by 1`, W.params)) byStatus[r.status] = Number(r.n);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const agg = (await rows<{ reopened: string; avg_hours: string | null }>(q,
    `select count(*) filter (where exists(select 1 from hd_ticket_event e where e.ticket_id = t.id and e.kind = 'reopen')) as reopened,
            avg(extract(epoch from (fr.first - t.created_at)) / 3600) as avg_hours
       from hd_ticket t left join lateral (select min(e.at) as first from hd_ticket_event e where e.ticket_id = t.id and e.kind = 'resolve') fr on true
      where ${W.sql}`, W.params))[0];

  const ag = (await rows<Record<string, string>>(q,
    `select count(*) filter (where now() - t.created_at < interval '2 days') a,
            count(*) filter (where now() - t.created_at >= interval '2 days' and now() - t.created_at < interval '7 days') b,
            count(*) filter (where now() - t.created_at >= interval '7 days' and now() - t.created_at < interval '15 days') c,
            count(*) filter (where now() - t.created_at >= interval '15 days') d
       from hd_ticket t where t.status in ${OPEN} and ${W.sql}`, W.params))[0];

  const WN = where(f, false); // monthly chart ignores the month filter and shows the whole year
  const nowYear = Number((await rows<{ y: string }>(q, `select extract(year from now() at time zone ${TZ})::int as y`, []))[0].y);
  const chartYear = f.year ?? nowYear;
  const created = await rows<{ m: number; n: string }>(q,
    `select extract(month from t.created_at at time zone ${TZ})::int m, count(*) n from hd_ticket t
      where ${WN.sql} and extract(year from t.created_at at time zone ${TZ}) = $3::int group by 1`, [...WN.params, chartYear]);
  const resolved = await rows<{ m: number; n: string }>(q,
    `select extract(month from e.at at time zone ${TZ})::int m, count(*) n from hd_ticket_event e join hd_ticket t on t.id = e.ticket_id
      where e.kind = 'resolve' and ${WN.sql} and extract(year from e.at at time zone ${TZ}) = $3::int group by 1`, [...WN.params, chartYear]);
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    created: Number(created.find((r) => Number(r.m) === i + 1)?.n ?? 0),
    resolved: Number(resolved.find((r) => Number(r.m) === i + 1)?.n ?? 0),
  }));

  const top = (sql: string) => rows<{ label: string; n: string }>(q, sql, W.params).then((r) => r.map((x) => ({ label: x.label, count: Number(x.n) })));
  const byAssignee = (await rows<{ name: string; open: string; done: string }>(q,
    `select t.assignee_name as name, count(*) filter (where t.status in ${OPEN}) as open, count(*) filter (where t.status in ('resolved','closed')) as done
       from hd_ticket t where ${W.sql} group by 1 order by 2 desc, 3 desc, 1 limit 25`, W.params)).map((r) => ({ name: r.name, open: Number(r.open), done: Number(r.done) }));

  const years = (await rows<{ y: number }>(q, `select distinct extract(year from created_at at time zone ${TZ})::int as y from hd_ticket order by 1 desc`, [])).map((r) => Number(r.y));
  const wings = (await rows<{ v: string }>(q, `select distinct wing as v from hd_ticket order by 1`, [])).map((r) => r.v);
  const callers = (await rows<{ v: string }>(q, `select distinct authenticator as v from hd_ticket order by 1`, [])).map((r) => r.v);

  return {
    filters: f, years, wings, callers,
    totals: {
      total, byStatus, open: byStatus.new + byStatus.inprogress + byStatus.onhold, reopened: Number(agg.reopened),
      avgResolutionHours: agg.avg_hours === null ? null : Math.round(Number(agg.avg_hours) * 10) / 10,
    },
    chartYear, byMonth,
    byNature: await top(`select t.nature_of_issue as label, count(*) n from hd_ticket t where ${W.sql} group by 1 order by 2 desc, 1 limit 10`),
    byCategory: await top(`select t.nature_of_issue || ' / ' || t.issue_category as label, count(*) n from hd_ticket t where ${W.sql} group by 1 order by 2 desc, 1 limit 10`),
    byWing: await top(`select t.wing as label, count(*) n from hd_ticket t where ${W.sql} group by 1 order by 2 desc`),
    byCaller: await top(`select t.authenticator as label, count(*) n from hd_ticket t where ${W.sql} group by 1 order by 2 desc`),
    byAssignee,
    aging: [
      { label: 'Under 2 days', count: Number(ag.a) }, { label: '2 to 6 days', count: Number(ag.b) },
      { label: '7 to 14 days', count: Number(ag.c) }, { label: '15 days or more', count: Number(ag.d) },
    ],
    generatedAt: new Date().toISOString(),
  };
}

/** A cell that starts with = + - @ would be run as a formula by Excel: prefix it so it stays text. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function casesCsv(q: Queryable, f: ReportFilters): Promise<string> {
  const W = where(f);
  const r = await rows<Record<string, unknown>>(q,
    `select t.ref_no, t.wing, t.authenticator as caller_type, t.nature_of_issue, t.issue_category, t.sub_category, t.status,
            t.ticket_type, t.source_of_issue, to_char(t.received_date,'YYYY-MM-DD') as received_date,
            to_char(t.created_at at time zone ${TZ},'YYYY-MM-DD HH24:MI') as created_at,
            to_char(t.resolved_at at time zone ${TZ},'YYYY-MM-DD HH24:MI') as resolved_at,
            t.raised_by_name, t.assignee_name
       from hd_ticket t where ${W.sql} order by t.created_at desc limit 50000`, W.params);
  const head = ['Reference', 'Wing', 'Caller type', 'Nature', 'Category', 'Sub-category', 'Status', 'Type', 'Source', 'Date received', 'Raised on', 'Resolved on', 'Raised by', 'Assigned to'];
  const keys = ['ref_no', 'wing', 'caller_type', 'nature_of_issue', 'issue_category', 'sub_category', 'status', 'ticket_type', 'source_of_issue', 'received_date', 'created_at', 'resolved_at', 'raised_by_name', 'assignee_name'];
  return `﻿${[head.map(cell).join(','), ...r.map((x) => keys.map((k) => cell(x[k])).join(','))].join('\r\n')}\r\n`; // BOM: Excel opens Tamil text correctly
}
