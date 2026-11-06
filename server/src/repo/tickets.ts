import type { DbConfig } from '../config.js';
import type { Db, Queryable } from '../dbAdapter.js';
import type { SessionUser } from '../security/session.js';
import { ApiError } from '../../../src/services/types.js';
import { matchRoute, validateNewTicket } from '../../../src/utils/ticketValidation.js';
import { longTextOk } from '../../../src/utils/inputPolicy.js';
import { similarity } from '../../../src/utils/similarity.js';
import type { Settings } from '../../../src/utils/settingsSchema.js';
import { sampleSources, sampleTypes } from '../../../src/services/ticketMasters.js';
import type {
  ActorRole, AssignmentKind, AssignmentRow, AttachmentMeta, CreatedTicket, FilterOptions, FormLimits, HistoryKind, HistoryRow, ListKind,
  NewTicketInput, Option, TicketAction, TicketDetail, TicketFilters, TicketMasters, TicketPage, TicketStatus, TicketSummary,
} from '../../../src/services/ticketTypes.js';
import { findAssignee, getResolver, listResolvers, type Resolver } from './people.js';
import { activeRoutes, findRoute } from './routing.js';

export const PAGE_SIZE = 10;
const DAY = 86_400_000;

export interface StoredFile {
  originalName: string;
  size: number;
  kind: 'proof' | 'other';
  contentType: string;
  sha256: string;
  /** Writes the file under the reference number and returns the path to keep in the database */
  save: (refNo: string, slot: number) => Promise<string>;
}

const actorRole = (u: SessionUser): ActorRole => (u.role === 'admin' ? 'helpdesk' : 'dealer');
const SYSTEM = { ref: 'system', name: 'System', role: 'system' as ActorRole };
const iso = (d: Date | string | number) => new Date(d).toISOString();
const ASSIGNMENT_KINDS = ['assigned', 'reassigned', 'transferred'];
const OPEN: TicketStatus[] = ['new', 'inprogress', 'onhold'];

export const limitsFrom = (S: Settings): FormLimits => ({
  minWords: Number(S['case.minWords']), maxWords: Number(S['case.maxWords']), maxFiles: Number(S['file.maxFiles']), maxTotalMB: Number(S['file.maxTotalMB']),
  requireEmail: Boolean(S['form.requireEmail']), requireMobile: Boolean(S['form.requireMobile']), blockDuplicateNames: Boolean(S['file.blockDuplicateNames']),
});

/* ---------- masters ---------- */
export async function mastersFor(q: Queryable, c: DbConfig, u: SessionUser, S: Settings): Promise<TicketMasters> {
  const limits = limitsFrom(S);
  if (u.creator) {
    const routes = await activeRoutes(q, c, null);
    const callers = [...new Set(routes.map((r) => r.authenticator))].sort();
    return {
      creator: true, limits,
      callerTypes: callers.map((x) => ({ id: x, label: x })),
      routes: routes.map(({ id: _i, assignTo: _a, ...r }) => r),
      types: sampleTypes, sources: sampleSources, isSample: true,
    };
  }
  if (!u.authenticator) return { creator: false, limits, callerTypes: [], routes: [], types: [], sources: [], isSample: false };
  const routes = await activeRoutes(q, c, u.authenticator);
  return {
    creator: false, limits,
    callerTypes: [{ id: u.authenticator, label: u.authenticator }],
    routes: routes.map(({ id: _i, assignTo: _a, ...r }) => r),
    types: [], sources: [], isSample: false,
  };
}

/* ---------- rows ---------- */
interface Row {
  id: string | number;
  ref_no: string;
  wing: string;
  authenticator: string;
  raised_by_ref: string;
  raised_by_name: string;
  ticket_type: string | null;
  source_of_issue: string | null;
  received: string | null;
  complainant_name: string;
  complainant_email: string;
  complainant_mobile: string | null;
  nature_of_issue: string;
  issue_category: string;
  sub_category: string;
  field_set: TicketDetail['fieldSet'];
  arr_number: string | null;
  model2_user_id: string | null;
  task_transfer_details: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  building: string | null;
  room: string | null;
  physical_location: string | null;
  description: string;
  status: TicketStatus;
  assignee_ref: string;
  assignee_name: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
  last_reopen: Date | string | null;
  transferred: boolean;
}
const COLS = `t.id, t.ref_no, t.wing, t.authenticator, t.raised_by_ref, t.raised_by_name, t.ticket_type, t.source_of_issue,
  to_char(t.received_date,'YYYY-MM-DD') as received, t.complainant_name, t.complainant_email, t.complainant_mobile,
  t.nature_of_issue, t.issue_category, t.sub_category, t.field_set, t.arr_number, t.model2_user_id, t.task_transfer_details,
  t.brand, t.model, t.serial_number, t.building, t.room, t.physical_location, t.description, t.status, t.assignee_ref, t.assignee_name, t.created_at, t.resolved_at,
  (select max(e.at) from hd_ticket_event e where e.ticket_id = t.id and e.kind = 'reopen') as last_reopen,
  exists(select 1 from hd_ticket_event e where e.ticket_id = t.id and e.kind in ('reassigned','transferred')) as transferred`;

async function insertEvent(
  q: Queryable, ticketId: number | string, kind: string, actor: { ref: string; name: string; role: ActorRole }, remark = '',
  from?: { ref: string; name: string }, to?: { ref: string; name: string },
) {
  await q.query(
    `insert into hd_ticket_event (ticket_id, kind, actor_ref, actor_name, actor_role, remark, from_ref, from_name, to_ref, to_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [ticketId, kind, actor.ref, actor.name, actor.role, remark, from?.ref ?? null, from?.name ?? null, to?.ref ?? null, to?.name ?? null],
  );
}

/* ---------- repeated-case check ---------- */
async function findSimilar(q: Queryable, u: SessionUser, i: NewTicketInput, S: Settings): Promise<{ ref: string; pct: number } | null> {
  const threshold = Number(S['dup.threshold']) / 100;
  const params: unknown[] = [u.userId, i.nature, i.category, i.subCategory, Number(S['dup.lookbackDays'])];
  // Help desk creators raise cases for many callers: a repeat means the same caller, not just the same creator.
  let who = '';
  if (u.creator) { params.push(i.email.trim().toLowerCase()); who = 'and lower(complainant_email) = $6'; }
  const r = await q.query<{ ref_no: string; description: string }>(
    `select ref_no, description from hd_ticket
      where raised_by_ref = $1 and nature_of_issue = $2 and issue_category = $3 and sub_category = $4 and status in ('new','inprogress','onhold')
        and created_at > now() - make_interval(days => $5::int) ${who}
      order by created_at desc limit 20`, params);
  let best: { ref: string; pct: number } | null = null;
  for (const row of r.rows) {
    const s = similarity(i.description, row.description, threshold);
    if (s >= threshold && (!best || s * 100 > best.pct)) best = { ref: row.ref_no, pct: Math.round(s * 100) };
  }
  return best;
}

/* ---------- create ---------- */
export async function createTicket(db: Db, c: DbConfig, u: SessionUser, input: NewTicketInput, files: StoredFile[], S: Settings): Promise<CreatedTicket> {
  if (!u.capabilities.raise) throw new ApiError('FORBIDDEN');
  const shown = (name: string) => (u.capabilities.assignedTickets ? { assigneeName: name } : {});
  const isRetry = async (q: Queryable) => {
    const r = await q.query<{ ref_no: string; assignee_name: string }>(
      `select ref_no, assignee_name from hd_ticket where raised_by_ref = $1 and client_request_id = $2`, [u.userId, input.clientRequestId]);
    return r.rows[0] ? { number: r.rows[0].ref_no, ...shown(r.rows[0].assignee_name) } : null;
  };
  if (!input.clientRequestId || input.clientRequestId.length > 64) throw new ApiError('VALIDATION', { field: 'clientRequestId' });
  const prior = await isRetry(db);
  if (prior) return prior; // retried submission: no duplicate

  const m = await mastersFor(db, c, u, S);
  const callerType = u.creator ? input.callerType : u.authenticator ?? '';
  const meta: AttachmentMeta[] = files.map((f) => ({ name: f.originalName, size: f.size, kind: f.kind }));
  const clean: NewTicketInput = { ...input, callerType, attachments: meta };
  const errs = validateNewTicket(clean, m);
  const first = Object.keys(errs)[0];
  if (first) throw new ApiError('VALIDATION', { field: first, code: errs[first] });
  const match = matchRoute(m, clean)!;

  let dup: { ref: string; pct: number } | null = null;
  if (S['dup.enabled']) {
    dup = await findSimilar(db, u, clean, S);
    if (dup && (S['dup.mode'] === 'block' || !input.confirmNotDuplicate)) {
      throw new ApiError('DUPLICATE_SUSPECTED', { number: dup.ref, similarity: dup.pct, blocked: S['dup.mode'] === 'block' ? 1 : 0 });
    }
  }

  const route = await findRoute(db, c, callerType, clean.nature, clean.category, clean.subCategory);
  const assignee = route ? await findAssignee(db, c, route.wing, route.assignTo) : null;
  if (!route || !assignee) throw new ApiError('ROUTING_FAILED'); // nothing is created

  const keep = (set: string, v: string) => (match.fieldSet === set ? v.trim() : null);
  const prefix = route.wing.toLowerCase() === 'helpdesk' ? 'H' : 'E';
  const seq = prefix === 'H' ? 'hd_ref_seq_h' : 'hd_ref_seq_e';
  try {
    return await db.tx(async (q) => {
      const n = await q.query<{ n: string }>(`select nextval('${seq}') as n`);
      const refNo = `${prefix}${String(n.rows[0].n).padStart(6, '0')}`;
      const ins = await q.query<{ id: string }>(
        `insert into hd_ticket (ref_no, client_request_id, wing, authenticator, raised_by_ref, raised_by_name, ticket_type, source_of_issue, received_date,
           complainant_name, complainant_email, complainant_mobile, nature_of_issue, issue_category, sub_category, field_set, arr_number, model2_user_id,
           task_transfer_details, brand, model, serial_number, building, room, physical_location, description, route_id, route_assign_to, assignee_ref, assignee_name,
           duplicate_of, dup_score)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32) returning id`,
        [refNo, input.clientRequestId, route.wing, callerType, u.userId, u.name,
          u.creator ? clean.type : null, u.creator ? clean.source : null, u.creator ? clean.receivedDate : null,
          clean.name.trim(), clean.email.trim(), clean.mobile?.trim() || null, clean.nature, clean.category, clean.subCategory, match.fieldSet,
          keep('gst', clean.arrNumber), keep('task', clean.model2UserId), keep('task', clean.taskTransferDetails),
          keep('hardware', clean.brand), keep('hardware', clean.model), keep('hardware', clean.serialNumber),
          keep('network', clean.building), keep('network', clean.room), keep('network', clean.physicalLocation),
          clean.description.trim(), route.id, route.assignTo, assignee.ref, assignee.name, dup?.ref ?? null, dup?.pct ?? null],
      );
      const id = ins.rows[0].id;
      await insertEvent(q, id, 'created', { ref: u.userId, name: u.name, role: actorRole(u) });
      await insertEvent(q, id, 'assigned', SYSTEM, '', undefined, { ref: assignee.ref, name: assignee.name });
      let slot = 0;
      for (const f of files) {
        slot += 1;
        const stored = await f.save(refNo, slot);
        await q.query(
          `insert into hd_ticket_attachment (ticket_id, slot, kind, original_name, stored_path, content_type, size_bytes, sha256) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, slot, f.kind, f.originalName, stored, f.contentType, f.size, f.sha256]);
      }
      return { number: refNo, ...shown(assignee.name) };
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      const again = await isRetry(db); // a simultaneous duplicate submission won the race
      if (again) return again;
    }
    throw e;
  }
}

/* ---------- reading ---------- */
const lockedStatus: Partial<Record<ListKind, TicketStatus>> = {
  'assigned-new': 'new', 'assigned-inprogress': 'inprogress', 'assigned-onhold': 'onhold', 'assigned-resolved': 'resolved', 'assigned-closed': 'closed',
};

/** WHERE fragment for the caller's own scope. A parameter is added only when the fragment uses it. */
function scopeOf(list: ListKind, u: SessionUser, params: unknown[]): string {
  if (list === 'closure') return u.capabilities.closeCases ? `t.status = 'resolved'` : 'false';
  if (list === 'mine') { params.push(u.userId); return `t.raised_by_ref = $${params.length}`; }
  if (!u.capabilities.assignedTickets) return 'false';
  params.push(u.userId);
  const base = `t.assignee_ref = $${params.length}`;
  if (list === 'assigned-reopened') return `${base} and exists(select 1 from hd_ticket_event e where e.ticket_id = t.id and e.kind = 'reopen')`;
  if (list === 'helpdesk') return u.capabilities.helpdeskReview ? `${base} and t.status in ('new','inprogress','onhold')` : 'false';
  const s = lockedStatus[list];
  return s ? `${base} and t.status = '${s}'` : 'false';
}

function summary(r: Row, u: SessionUser): TicketSummary {
  const s: TicketSummary = {
    number: r.ref_no, wing: r.wing, nature: r.nature_of_issue, category: r.issue_category, subCategory: r.sub_category,
    status: r.status, createdAt: iso(r.created_at),
  };
  if (u.capabilities.assignedTickets || u.capabilities.closeCases) s.assigneeName = r.assignee_name; // omitted entirely for the person who raised the ticket
  if (r.last_reopen) s.lastReopenedAt = iso(r.last_reopen);
  if (u.capabilities.viewAssignmentHistory) s.originalOrTransferred = r.transferred ? 'transferred' : 'original'; // key absent for everyone else
  return s;
}

export async function listTickets(q: Queryable, u: SessionUser, list: ListKind, f: TicketFilters, page: number): Promise<TicketPage> {
  if (list === 'closure' ? !u.capabilities.closeCases : list !== 'mine' && !u.capabilities.assignedTickets) throw new ApiError('FORBIDDEN');
  if (list === 'helpdesk' && !u.capabilities.helpdeskReview) throw new ApiError('FORBIDDEN');
  const params: unknown[] = [];
  const where = [scopeOf(list, u, params)];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (!lockedStatus[list] && list !== 'closure' && f.status) add('t.status = ?', f.status);
  if (f.number.trim()) add(`lower(t.ref_no) like '%' || ? || '%'`, f.number.trim().toLowerCase().replace(/[\\%_]/g, ''));
  if (f.nature) add('t.nature_of_issue = ?', f.nature);
  if (f.category) add('t.issue_category = ?', f.category);
  if (f.assignee) add('t.assignee_ref = ?', f.assignee);
  if (list === 'mine' && f.reopenedOnly) where.push(`exists(select 1 from hd_ticket_event e where e.ticket_id = t.id and e.kind = 'reopen')`);
  if (u.capabilities.viewAssignmentHistory && f.originalTransferred) {
    where.push(`${f.originalTransferred === 'transferred' ? '' : 'not '}exists(select 1 from hd_ticket_event e where e.ticket_id = t.id and e.kind in ('reassigned','transferred'))`);
  }
  const w = where.join(' and ');
  const total = Number((await q.query<{ n: string }>(`select count(*) as n from hd_ticket t where ${w}`, params)).rows[0].n);
  const p = Math.max(1, Math.floor(page) || 1);
  const rows = await q.query<Row>(
    `select ${COLS} from hd_ticket t where ${w} order by t.created_at desc, t.id desc limit ${PAGE_SIZE} offset ${(p - 1) * PAGE_SIZE}`, params);
  return { items: rows.rows.map((r) => summary(r, u)), total, page: p, pageSize: PAGE_SIZE };
}

export async function filterOptions(q: Queryable, u: SessionUser, list: ListKind): Promise<FilterOptions> {
  const params: unknown[] = [];
  const w = scopeOf(list, u, params);
  const seeAssignees = u.capabilities.assignedTickets || u.capabilities.closeCases;
  const a = !seeAssignees ? { rows: [] as { ref: string; name: string }[] } : await q.query<{ ref: string; name: string }>(`select distinct t.assignee_ref as ref, t.assignee_name as name from hd_ticket t where ${w} order by 2`, params);
  const k = await q.query<{ nature: string; category: string }>(`select distinct t.nature_of_issue as nature, t.issue_category as category from hd_ticket t where ${w} order by 1, 2`, params);
  return { assignees: a.rows.map((r): Option => ({ id: r.ref, label: r.name })), classes: k.rows };
}

function actionsFor(r: Pick<Row, 'status' | 'assignee_ref' | 'raised_by_ref' | 'resolved_at'>, u: SessionUser, S: Settings): TicketDetail['actions'] {
  const mine = r.assignee_ref === u.userId;
  const creator = r.raised_by_ref === u.userId;
  const s = r.status;
  const active = OPEN.includes(s);
  const days = Number(S['life.reopenDays']);
  const withinWindow = days > 0 && !!r.resolved_at && Date.now() < new Date(r.resolved_at).getTime() + days * DAY;
  const final = s === 'closed' || s === 'withdrawn';
  return {
    start: mine && s === 'new',
    remark: mine && s === 'inprogress',
    hold: mine && s === 'inprogress',
    resume: mine && s === 'onhold',
    resolve: mine && s === 'inprogress',
    reopen: creator && s === 'resolved' && withinWindow,
    withdraw: creator && s === 'new' && Boolean(S['life.withdrawEnabled']), // never once work has started
    close: u.capabilities.closeCases && s === 'resolved', // only the Super Admin: not the raiser, not the resolver
    comment: !final && (creator || mine || u.capabilities.closeCases),
    sendToHelpdesk: false, // not used with the real accounts: the Help desk accounts are ordinary resolvers
    reassign: u.capabilities.reassign && mine && active,
  };
}

interface EvRow {
  at: Date | string; kind: string; actor_name: string; actor_role: ActorRole; remark: string; from_name: string | null; to_name: string | null;
}

async function loadDetail(q: Queryable, r: Row, u: SessionUser, S: Settings): Promise<TicketDetail> {
  const evs = (await q.query<EvRow>(`select at, kind, actor_name, actor_role, remark, from_name, to_name from hd_ticket_event where ticket_id = $1 order by at desc, id desc`, [r.id])).rows; // latest first
  const att = (await q.query<{ original_name: string; size_bytes: number; kind: 'proof' | 'other' }>(
    `select original_name, size_bytes, kind from hd_ticket_attachment where ticket_id = $1 order by slot`, [r.id])).rows;
  const row = (e: EvRow) => ({ at: iso(e.at), text: e.remark, byName: e.actor_name, byRole: e.actor_role });
  const extra: TicketDetail['extra'] = {};
  const put = (k: keyof TicketDetail['extra'], v: string | null) => { if (v && v.trim()) extra[k] = v.trim(); };
  put('arrNumber', r.arr_number); put('model2UserId', r.model2_user_id); put('taskTransferDetails', r.task_transfer_details);
  put('brand', r.brand); put('model', r.model); put('serialNumber', r.serial_number);
  put('building', r.building); put('room', r.room); put('physicalLocation', r.physical_location);
  const d: TicketDetail = {
    ...summary(r, u),
    callerType: r.authenticator,
    creatorName: r.raised_by_name,
    complainant: { name: r.complainant_name, email: r.complainant_email, mobile: r.complainant_mobile ?? '' },
    fieldSet: r.field_set,
    description: r.description,
    extra,
    attachments: att.map((a) => ({ name: a.original_name, size: a.size_bytes, kind: a.kind })),
    history: evs.filter((e) => !ASSIGNMENT_KINDS.includes(e.kind)).map((e): HistoryRow => ({ ...row(e), kind: e.kind as HistoryKind })),
    actions: actionsFor(r, u, S),
  };
  if (r.ticket_type) {
    d.typeLabel = r.ticket_type;
    d.sourceLabel = r.source_of_issue ?? '';
    d.receivedDate = r.received ?? '';
  }
  if (r.status === 'resolved' && r.resolved_at) {
    const at = new Date(r.resolved_at).getTime();
    if (Number(S['life.reopenDays']) > 0) d.reopenUntil = iso(at + Number(S['life.reopenDays']) * DAY);
    if (S['life.autoCloseEnabled']) d.autoClosesOn = iso(at + Number(S['life.autoCloseDays']) * DAY);
  }
  if (u.capabilities.viewAssignmentHistory) {
    d.assignmentHistory = evs.filter((e) => ASSIGNMENT_KINDS.includes(e.kind)).map(
      (e): AssignmentRow => ({ ...row(e), kind: e.kind as AssignmentKind, fromName: e.from_name ?? undefined, toName: e.to_name ?? undefined }),
    );
  }
  return d;
}

async function fetchRow(q: Queryable, number: string, u: SessionUser, lock: boolean): Promise<Row> {
  // Same error for "missing" and "not yours": existence is not revealed.
  const r = await q.query<Row>(
    `select ${COLS} from hd_ticket t where lower(t.ref_no) = lower($1) and (t.raised_by_ref = $2 or t.assignee_ref = $2 or $3::boolean)${lock ? ' for update of t' : ''}`,
    [number, u.userId, u.capabilities.closeCases]);
  if (!r.rows[0]) throw new ApiError('FORBIDDEN');
  return r.rows[0];
}

export async function getTicket(q: Queryable, u: SessionUser, number: string, S: Settings): Promise<TicketDetail> {
  return loadDetail(q, await fetchRow(q, number, u, false), u, S);
}

export async function reassignTargets(q: Queryable, c: DbConfig, u: SessionUser): Promise<Option[]> {
  if (!u.capabilities.reassign) throw new ApiError('FORBIDDEN');
  return (await listResolvers(q, c)).filter((x) => x.ref !== u.userId).map((x) => ({ id: x.ref, label: x.name }));
}

/* ---------- actions ---------- */
const TEXT_MAX = 2000;
/** Required text of an action: present, not too long, and passing the character policy. */
function text(s: string | undefined, required = true): string {
  const v = (s ?? '').trim();
  if (!v && required) throw new ApiError('VALIDATION', { field: 'text' });
  if (v.length > TEXT_MAX || !longTextOk(v)) throw new ApiError('VALIDATION', { field: 'text', code: 'err.t.chars' });
  return v;
}

export async function act(db: Db, c: DbConfig, u: SessionUser, number: string, expected: TicketStatus, a: TicketAction, S: Settings): Promise<TicketDetail | null> {
  return db.tx(async (q) => {
    const t = await fetchRow(q, number, u, true); // row locked until commit: concurrent actions queue up
    if (t.status !== expected) throw new ApiError('INVALID_STATE');
    const allowed = actionsFor(t, u, S);
    const need = (ok: boolean) => { if (!ok) throw new ApiError('FORBIDDEN'); };
    const me = { ref: u.userId, name: u.name, role: actorRole(u) };
    const setStatus = (s: TicketStatus, extra = '') => q.query(`update hd_ticket set status = $1, updated_at = now()${extra} where id = $2`, [s, t.id]);
    let assigneeRef = t.assignee_ref;
    switch (a.type) {
      case 'start': need(allowed.start); await setStatus('inprogress'); await insertEvent(q, t.id, 'started', me); break;
      case 'remark': need(allowed.remark); await insertEvent(q, t.id, 'remark', me, text(a.text)); break;
      case 'comment': need(allowed.comment); await insertEvent(q, t.id, 'comment', me, text(a.text)); break;
      case 'hold': need(allowed.hold); { const r = text(a.reason); await setStatus('onhold'); await insertEvent(q, t.id, 'hold', me, r); } break;
      case 'resume': need(allowed.resume); await setStatus('inprogress'); await insertEvent(q, t.id, 'resume', me); break;
      case 'resolve': need(allowed.resolve); { const r = text(a.details); await setStatus('resolved', ', resolved_at = now()'); await insertEvent(q, t.id, 'resolve', me, r); } break;
      case 'withdraw': need(allowed.withdraw); { const r = text(a.reason); await setStatus('withdrawn'); await insertEvent(q, t.id, 'withdraw', me, r); } break;
      case 'close': need(allowed.close); { const r = text(a.remark, false); await setStatus('closed'); await insertEvent(q, t.id, 'close', me, r); } break;
      case 'reopen': {
        need(allowed.reopen);
        const reason = text(a.reason);
        const route = await findRoute(q, c, t.authenticator, t.nature_of_issue, t.issue_category, t.sub_category);
        const to = route ? await findAssignee(q, c, route.wing, route.assignTo) : null;
        if (!to) throw new ApiError('ROUTING_FAILED'); // the ticket stays Resolved
        await insertEvent(q, t.id, 'reopen', me, reason);
        await insertEvent(q, t.id, 'assigned', SYSTEM, '', { ref: t.assignee_ref, name: t.assignee_name }, { ref: to.ref, name: to.name });
        await q.query(`update hd_ticket set status = 'new', resolved_at = null, assignee_ref = $1, assignee_name = $2, updated_at = now() where id = $3`, [to.ref, to.name, t.id]);
        assigneeRef = to.ref;
        break;
      }
      case 'reassign': {
        need(allowed.reassign);
        const reason = text(a.reason);
        const to: Resolver | null = a.assigneeId === t.assignee_ref ? null : await getResolver(q, c, a.assigneeId);
        if (!to) throw new ApiError('VALIDATION', { field: 'assignee' });
        await insertEvent(q, t.id, 'reassigned', me, reason, { ref: t.assignee_ref, name: t.assignee_name }, { ref: to.ref, name: to.name });
        await q.query(`update hd_ticket set assignee_ref = $1, assignee_name = $2, updated_at = now() where id = $3`, [to.ref, to.name, t.id]); // status retained
        assigneeRef = to.ref;
        break;
      }
      default:
        throw new ApiError('FORBIDDEN'); // sendToHelpdesk is not available with the real accounts
    }
    if (t.raised_by_ref !== u.userId && assigneeRef !== u.userId && !u.capabilities.closeCases) return null; // no access any more (e.g. reassigned away)
    return loadDetail(q, await fetchRow(q, number, u, false), u, S);
  });
}

/** Closes Resolved cases that were neither reopened nor closed within the configured days. Returns how many were closed. */
export async function autoCloseDue(db: Db, S: Settings): Promise<number> {
  if (!S['life.autoCloseEnabled']) return 0;
  const days = Number(S['life.autoCloseDays']);
  return db.tx(async (q) => {
    const r = await q.query<{ id: string }>(
      `select id from hd_ticket where status = 'resolved' and resolved_at is not null and resolved_at < now() - make_interval(days => $1::int) for update`, [days]);
    for (const x of r.rows) {
      await q.query(`update hd_ticket set status = 'closed', updated_at = now() where id = $1`, [x.id]);
      await insertEvent(q, x.id, 'close', SYSTEM, `Closed automatically: not reopened within ${days} days of being resolved.`);
    }
    return r.rows.length;
  });
}
