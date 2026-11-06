/**
 * MOCK TICKET SERVICE: PROTOTYPE ONLY. Data lives in memory and is lost on refresh.
 * It deliberately behaves like the real server must: every response is filtered by the caller,
 * restricted assignment history never leaves this module for unauthorised callers, and every
 * action re-checks the latest stored status and permissions.
 */
import { longTextOk } from '../utils/inputPolicy';
import { defaultSettings } from '../utils/settingsSchema';
import { similarity } from '../utils/similarity';
import { matchRoute, validateNewTicket } from '../utils/ticketValidation';
import { getSession, type SessionUser } from './mockSession';
import { HELPDESK_ID, OFFICER_ID, allRoutes, assigneeIdFor, roster, sampleSources, sampleTypes } from './ticketMasters';
import { sampleRoutes } from './sampleRoutes';
import { ApiError } from './types';
import {
  DEFAULT_LIMITS,
  type ActorRole,
  type AssignmentKind,
  type AssignmentRow,
  type CreatedTicket,
  type FilterOptions,
  type HistoryKind,
  type HistoryRow,
  type ListKind,
  type NewTicketInput,
  type Option,
  type RouteRow,
  type TicketAction,
  type TicketApi,
  type TicketDetail,
  type TicketMasters,
  type TicketPage,
  type TicketStatus,
  type TicketSummary,
} from './ticketTypes';

const isTest = import.meta.env.MODE === 'test';
const delay = (ms = 350) => (isTest ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
export const PAGE_SIZE = 10;

interface Ev {
  at: number;
  kind: HistoryKind | AssignmentKind;
  actorId: string;
  actorName: string;
  actorRole: ActorRole;
  text: string;
  fromId?: string;
  toId?: string;
}
interface Rec {
  resolvedAt?: number;
  dupOf?: string;
  number: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  status: TicketStatus;
  authenticator: string;
  wing: string;
  input: NewTicketInput;
  assigneeId: string;
  events: Ev[];
}

const ASSIGNMENT_KINDS: string[] = ['assigned', 'reassigned', 'transferred'];
const isAssignmentEv = (e: Ev) => ASSIGNMENT_KINDS.includes(e.kind);

const SET = defaultSettings();
const DAY_MS = 86_400_000;
const seqs: Record<string, number> = { E: 0, H: 0 };
let store: Rec[] = [];
const requests = new Map<string, CreatedTicket & { creatorId: string }>();

const nameOf = (id: string) => roster.find((r) => r.id === id)?.label ?? 'Unassigned';
const iso = (ms: number) => new Date(ms).toISOString();
const SYSTEM = { actorId: 'system', actorName: 'System', actorRole: 'system' as ActorRole };
const roleOf = (u: SessionUser): ActorRole => (u.role === 'admin' ? 'helpdesk' : u.role);
const nextNumber = (wing: string) => {
  const p = wing.toLowerCase() === 'helpdesk' ? 'H' : 'E';
  seqs[p] += 1;
  return `${p}${String(seqs[p]).padStart(6, '0')}`;
};

const authenticatorOf = (u: SessionUser) => (u.role === 'dealer' ? 'Dealer' : u.role === 'officer' ? 'Officer' : 'Others');
const isCreator = (u: SessionUser) => u.role === 'admin';

function mastersFor(u: SessionUser): TicketMasters {
  const creator = isCreator(u);
  const callers = ['Dealer', 'Officer', 'Others'];
  return {
    creator,
    limits: DEFAULT_LIMITS,
    callerTypes: (creator ? callers : [authenticatorOf(u)]).map((c) => ({ id: c, label: c })),
    routes: creator ? allRoutes : allRoutes.filter((r) => r.authenticator === authenticatorOf(u)),
    types: creator ? sampleTypes : [],
    sources: creator ? sampleSources : [],
    isSample: true,
  };
}

function route(authenticator: string, r: Pick<RouteRow, 'nature' | 'category' | 'subCategory'>): string {
  const hit = sampleRoutes.find((x) => x[0] === authenticator && x[2] === r.nature && x[3] === r.category && x[4] === r.subCategory);
  if (!hit) throw new ApiError('ROUTING_FAILED');
  return assigneeIdFor(hit[5]);
}

function needUser(): SessionUser {
  const u = getSession();
  if (!u) throw new ApiError('UNAUTHENTICATED');
  return u;
}

const canRead = (t: Rec, u: SessionUser) => t.creatorId === u.userId || t.assigneeId === u.userId || u.capabilities.closeCases;
const isActive = (t: Rec) => t.status === 'new' || t.status === 'inprogress' || t.status === 'onhold';
const reopenEvents = (t: Rec) => t.events.filter((e) => e.kind === 'reopen');
const wasTransferred = (t: Rec) => t.events.some((e) => e.kind === 'reassigned' || e.kind === 'transferred');

function actionsFor(t: Rec, u: SessionUser): TicketDetail['actions'] {
  const mine = t.assigneeId === u.userId;
  const creator = t.creatorId === u.userId;
  const st = t.status;
  const window = Number(SET['life.reopenDays']) * DAY_MS;
  return {
    start: mine && st === 'new',
    remark: mine && st === 'inprogress',
    hold: mine && st === 'inprogress',
    resume: mine && st === 'onhold',
    resolve: mine && st === 'inprogress',
    reopen: creator && st === 'resolved' && window > 0 && !!t.resolvedAt && Date.now() < t.resolvedAt + window,
    withdraw: creator && st === 'new', // never once work has started
    close: u.capabilities.closeCases && st === 'resolved', // only the admin: not the raiser, not the resolver
    comment: st !== 'closed' && st !== 'withdrawn' && (creator || mine || u.capabilities.closeCases),
    sendToHelpdesk: u.capabilities.sendToHelpdesk && mine && isActive(t) && t.assigneeId !== HELPDESK_ID,
    reassign: u.capabilities.reassign && mine && isActive(t),
  };
}

function summary(t: Rec, u: SessionUser): TicketSummary {
  const evs = reopenEvents(t);
  const last = evs[evs.length - 1];
  const s: TicketSummary = {
    number: t.number,
    wing: t.wing,
    nature: t.input.nature,
    category: t.input.category,
    subCategory: t.input.subCategory,
    status: t.status,
    createdAt: iso(t.createdAt),
  };
  if (u.capabilities.assignedTickets || u.capabilities.closeCases) s.assigneeName = nameOf(t.assigneeId); // never shown to the person who raised it
  if (last) s.lastReopenedAt = iso(last.at);
  // Restricted: only built for callers who hold the permission; otherwise the key does not exist at all.
  if (u.capabilities.viewAssignmentHistory) s.originalOrTransferred = wasTransferred(t) ? 'transferred' : 'original';
  return s;
}

function detail(t: Rec, u: SessionUser): TicketDetail {
  const i = t.input;
  const fieldSet = allRoutes.find((r) => r.authenticator === t.authenticator && r.nature === i.nature && r.category === i.category && r.subCategory === i.subCategory)?.fieldSet ?? 'none';
  const row = (e: Ev) => ({ at: iso(e.at), text: e.text, byName: e.actorName, byRole: e.actorRole });
  const latestFirst = [...t.events].reverse(); // latest on top
  const history: HistoryRow[] = latestFirst.filter((e) => !isAssignmentEv(e)).map((e) => ({ ...row(e), kind: e.kind as HistoryKind }));
  const extra: TicketDetail['extra'] = {};
  const put = (k: keyof TicketDetail['extra']) => {
    if (i[k].trim()) extra[k] = i[k].trim();
  };
  if (fieldSet === 'gst') put('arrNumber');
  if (fieldSet === 'task') (['model2UserId', 'taskTransferDetails'] as const).forEach(put);
  if (fieldSet === 'hardware') (['brand', 'model', 'serialNumber'] as const).forEach(put);
  if (fieldSet === 'network') (['building', 'room', 'physicalLocation'] as const).forEach(put);
  const d: TicketDetail = {
    ...summary(t, u),
    callerType: t.authenticator,
    creatorName: t.creatorName,
    complainant: { name: i.name, email: i.email, mobile: i.mobile },
    fieldSet,
    description: i.description,
    extra,
    attachments: i.attachments.map((a) => ({ ...a })),
    history,
    actions: actionsFor(t, u),
  };
  if (t.status === 'resolved' && t.resolvedAt) {
    if (Number(SET['life.reopenDays']) > 0) d.reopenUntil = iso(t.resolvedAt + Number(SET['life.reopenDays']) * DAY_MS);
    if (SET['life.autoCloseEnabled']) d.autoClosesOn = iso(t.resolvedAt + Number(SET['life.autoCloseDays']) * DAY_MS);
  }
  if (i.type) {
    d.typeLabel = i.type;
    d.sourceLabel = i.source;
    d.receivedDate = i.receivedDate;
  }
  if (u.capabilities.viewAssignmentHistory) {
    d.assignmentHistory = latestFirst.filter(isAssignmentEv).map(
      (e): AssignmentRow => ({
        ...row(e),
        kind: e.kind as AssignmentKind,
        fromName: e.fromId ? nameOf(e.fromId) : undefined,
        toName: e.toId ? nameOf(e.toId) : undefined,
      }),
    );
  }
  return d;
}

function find(number: string, u: SessionUser): Rec {
  const t = store.find((x) => x.number.toLowerCase() === number.toLowerCase());
  // Same error for "missing" and "not yours": existence is not revealed.
  if (!t || !canRead(t, u)) throw new ApiError('FORBIDDEN');
  return t;
}

function inScope(list: ListKind, t: Rec, u: SessionUser): boolean {
  if (list === 'mine') return t.creatorId === u.userId;
  if (list === 'closure') return u.capabilities.closeCases && t.status === 'resolved';
  if (!u.capabilities.assignedTickets || t.assigneeId !== u.userId) return false;
  switch (list) {
    case 'assigned-new': return t.status === 'new';
    case 'assigned-inprogress': return t.status === 'inprogress';
    case 'assigned-onhold': return t.status === 'onhold';
    case 'assigned-resolved': return t.status === 'resolved';
    case 'assigned-closed': return t.status === 'closed';
    case 'assigned-reopened': return reopenEvents(t).length > 0;
    case 'helpdesk': return u.capabilities.helpdeskReview && isActive(t);
  }
  return false;
}

const lockedStatus: Partial<Record<ListKind, TicketStatus>> = {
  'assigned-new': 'new',
  'assigned-inprogress': 'inprogress',
  'assigned-onhold': 'onhold',
  'assigned-resolved': 'resolved',
  'assigned-closed': 'closed',
};

function add(t: Rec, kind: Ev['kind'], actor: { actorId: string; actorName: string; actorRole: ActorRole }, text = '', extra: Partial<Ev> = {}, at = Date.now()) {
  t.events.push({ at, kind, text, ...actor, ...extra });
}
const actorOf = (u: SessionUser) => ({ actorId: u.userId, actorName: u.name, actorRole: roleOf(u) });
const blank = (s: string) => !s || !s.trim();
/** Required action text: present, not too long, and passing the character policy (same rules as the server). */
function clean(s: string | undefined, required = true): string {
  const v = (s ?? '').trim();
  if (!v && required) blankFail();
  if (v.length > 2000 || !longTextOk(v)) throw new ApiError('VALIDATION', { field: 'text', code: 'err.t.chars' });
  return v;
}

function blankFail(): never {
  throw new ApiError('VALIDATION', { field: 'text' });
}

export const ticketMock: TicketApi = {
  async getMasters() {
    await delay(150);
    return mastersFor(needUser());
  },

  async createTicket(input) {
    await delay();
    const u = needUser();
    if (!u.capabilities.raise) throw new ApiError('FORBIDDEN');
    const prior = requests.get(input.clientRequestId);
    if (prior && prior.creatorId === u.userId) return { number: prior.number, ...(u.capabilities.assignedTickets ? { assigneeName: prior.assigneeName } : {}) }; // retry: no duplicate
    const m = mastersFor(u);
    const callerType = isCreator(u) ? input.callerType : authenticatorOf(u);
    const errs = validateNewTicket({ ...input, callerType }, m);
    const first = Object.keys(errs)[0];
    if (first) throw new ApiError('VALIDATION', { field: first, code: errs[first] });
    const match = matchRoute(m, { ...input, callerType })!;
    // Repeated-case check (same raiser and classification, similar text)
    let dupOf: string | undefined;
    if (SET['dup.enabled']) {
      const th = Number(SET['dup.threshold']) / 100;
      const hit = store
        .filter((x) => x.creatorId === u.userId && (x.status === 'new' || x.status === 'inprogress' || x.status === 'onhold') && x.input.nature === input.nature && x.input.category === input.category && x.input.subCategory === input.subCategory
          && (!isCreator(u) || x.input.email.toLowerCase() === input.email.trim().toLowerCase()) && Date.now() - x.createdAt < Number(SET['dup.lookbackDays']) * DAY_MS)
        .map((x) => ({ x, s: similarity(input.description, x.input.description, th) }))
        .filter((r) => r.s >= th)
        .sort((a, b) => b.s - a.s)[0];
      if (hit) {
        if (SET['dup.mode'] === 'block' || !input.confirmNotDuplicate) throw new ApiError('DUPLICATE_SUSPECTED', { number: hit.x.number, similarity: Math.round(hit.s * 100), blocked: SET['dup.mode'] === 'block' ? 1 : 0 });
        dupOf = hit.x.number;
      }
    }
    const assigneeId = route(callerType, input); // throws ROUTING_FAILED before anything is saved
    const now = Date.now();
    const keep = (set: string, v: string) => (match.fieldSet === set ? v.trim() : '');
    const t: Rec = {
      number: nextNumber(match.wing),
      creatorId: u.userId,
      creatorName: u.name,
      createdAt: now,
      status: 'new',
      authenticator: callerType,
      wing: match.wing,
      input: {
        ...input,
        callerType,
        name: input.name.trim(),
        description: input.description.trim(),
        type: isCreator(u) ? input.type : '',
        source: isCreator(u) ? input.source : '',
        receivedDate: isCreator(u) ? input.receivedDate : '',
        arrNumber: keep('gst', input.arrNumber),
        model2UserId: keep('task', input.model2UserId),
        taskTransferDetails: keep('task', input.taskTransferDetails),
        brand: keep('hardware', input.brand),
        model: keep('hardware', input.model),
        serialNumber: keep('hardware', input.serialNumber),
        building: keep('network', input.building),
        room: keep('network', input.room),
        physicalLocation: keep('network', input.physicalLocation),
      },
      assigneeId,
      dupOf,
      events: [],
    };
    add(t, 'created', actorOf(u));
    add(t, 'assigned', SYSTEM, '', { toId: assigneeId });
    store.push(t);
    const res = { number: t.number, assigneeName: nameOf(assigneeId) };
    requests.set(input.clientRequestId, { ...res, creatorId: u.userId });
    return u.capabilities.assignedTickets ? res : { number: t.number };
  },

  async listTickets(list, f, page) {
    await delay(250);
    const u = needUser();
    if (list === 'closure' ? !u.capabilities.closeCases : list !== 'mine' && !u.capabilities.assignedTickets) throw new ApiError('FORBIDDEN');
    if (list === 'helpdesk' && !u.capabilities.helpdeskReview) throw new ApiError('FORBIDDEN');
    const lock = lockedStatus[list];
    const num = f.number.trim().toLowerCase();
    let rows = store.filter((t) => inScope(list, t, u));
    rows = rows.filter((t) => {
      const i = t.input;
      if (lock && t.status !== lock) return false;
      if (!lock && list !== 'closure' && f.status && t.status !== f.status) return false;
      if (num && !t.number.toLowerCase().includes(num)) return false;
      if (f.nature && i.nature !== f.nature) return false;
      if (f.category && i.category !== f.category) return false;
      if (f.assignee && t.assigneeId !== f.assignee) return false;
      if (list === 'mine' && f.reopenedOnly && !reopenEvents(t).length) return false;
      // Honoured only for callers who hold the permission; ignored (never an error) for everyone else.
      if (u.capabilities.viewAssignmentHistory && f.originalTransferred) {
        if ((wasTransferred(t) ? 'transferred' : 'original') !== f.originalTransferred) return false;
      }
      return true;
    });
    rows.sort((a, b) => b.createdAt - a.createdAt || b.number.localeCompare(a.number));
    const p = Math.max(1, page);
    return {
      items: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE).map((t) => summary(t, u)),
      total: rows.length,
      page: p,
      pageSize: PAGE_SIZE,
    } satisfies TicketPage;
  },

  async getFilterOptions(list): Promise<FilterOptions> {
    await delay(100);
    const u = needUser();
    const mine = store.filter((t) => inScope(list, t, u));
    const ids = new Set(mine.map((t) => t.assigneeId));
    const classes = new Map<string, { nature: string; category: string }>();
    mine.forEach((t) => classes.set(`${t.input.nature}|${t.input.category}`, { nature: t.input.nature, category: t.input.category }));
    return {
      assignees: !u.capabilities.assignedTickets ? [] : [...ids].map((id): Option => ({ id, label: nameOf(id) })),
      classes: [...classes.values()],
    };
  },

  async getTicket(number) {
    await delay(250);
    const u = needUser();
    return detail(find(number, u), u);
  },

  async getReassignTargets() {
    await delay(100);
    const u = needUser();
    if (u.capabilities.reassign) return roster.filter((r) => r.id !== u.userId);
    if (u.capabilities.sendToHelpdesk) return roster.filter((r) => r.id === HELPDESK_ID);
    throw new ApiError('FORBIDDEN');
  },

  async act(number, expectedStatus, a: TicketAction) {
    await delay();
    const u = needUser();
    const t = find(number, u);
    if (t.status !== expectedStatus) throw new ApiError('INVALID_STATE'); // outdated view: reject, UI refreshes
    const allowed = actionsFor(t, u);
    const me = actorOf(u);
    const need = (ok: boolean) => {
      if (!ok) throw new ApiError('FORBIDDEN');
    };
    switch (a.type) {
      case 'start':
        need(allowed.start);
        t.status = 'inprogress';
        add(t, 'started', me);
        break;
      case 'remark':
        need(allowed.remark);
        add(t, 'remark', me, clean(a.text));
        break;
      case 'comment':
        need(allowed.comment);
        add(t, 'comment', me, clean(a.text));
        break;
      case 'hold': {
        need(allowed.hold);
        const r = clean(a.reason);
        t.status = 'onhold';
        add(t, 'hold', me, r);
        break;
      }
      case 'resume':
        need(allowed.resume);
        t.status = 'inprogress';
        add(t, 'resume', me);
        break;
      case 'resolve': {
        need(allowed.resolve);
        const r = clean(a.details);
        t.status = 'resolved';
        t.resolvedAt = Date.now();
        add(t, 'resolve', me, r);
        break;
      }
      case 'reopen': {
        need(allowed.reopen);
        const reason = clean(a.reason);
        const to = route(t.authenticator, t.input); // routing failure leaves the ticket Resolved
        t.status = 'new';
        t.resolvedAt = undefined;
        add(t, 'reopen', me, reason);
        add(t, 'assigned', SYSTEM, '', { fromId: t.assigneeId, toId: to });
        t.assigneeId = to;
        break;
      }
      case 'withdraw': {
        need(allowed.withdraw);
        const r = clean(a.reason);
        t.status = 'withdrawn';
        add(t, 'withdraw', me, r);
        break;
      }
      case 'close':
        need(allowed.close);
        t.status = 'closed';
        add(t, 'close', me, clean(a.remark, false));
        break;
      case 'sendToHelpdesk':
        need(allowed.sendToHelpdesk);
        if (blank(a.reason)) blankFail();
        add(t, 'transferred', me, a.reason.trim(), { fromId: t.assigneeId, toId: HELPDESK_ID });
        t.assigneeId = HELPDESK_ID; // status retained (draft rule)
        break;
      case 'reassign': {
        need(allowed.reassign);
        if (blank(a.reason)) blankFail();
        if (!roster.some((r) => r.id === a.assigneeId) || a.assigneeId === t.assigneeId) throw new ApiError('VALIDATION', { field: 'assignee' });
        add(t, 'reassigned', me, a.reason.trim(), { fromId: t.assigneeId, toId: a.assigneeId });
        t.assigneeId = a.assigneeId; // status retained (draft rule)
        break;
      }
    }
    return canRead(t, u) ? detail(t, u) : null;
  },
};

/* ---------------- seed data ---------------- */
type Who = { id: string; name: string; role: ActorRole };
const DAY = 86_400_000;
const REG = { id: 'reg:user.demo@example.com', name: 'Demo User', role: 'registered' as ActorRole };
const DLR = { id: 'dealer:33ABCDE1234F1Z7', name: 'Demo Dealer', role: 'dealer' as ActorRole };
const OFF = { id: OFFICER_ID, name: 'Demo Officer', role: 'officer' as ActorRole };
const ADM = { id: HELPDESK_ID, name: 'Admin Helpdesk', role: 'helpdesk' as ActorRole };
const EXT = { id: 'reg:sample.user@example.com', name: 'Sample User', role: 'registered' as ActorRole };
const SYS: Who = { id: 'system', name: 'System', role: 'system' };

const blankInput = (): NewTicketInput => ({
  clientRequestId: '', callerType: '', type: '', source: '', receivedDate: '', name: '', email: '', mobile: '',
  nature: '', category: '', subCategory: '', description: '', arrNumber: '', model2UserId: '', taskTransferDetails: '',
  brand: '', model: '', serialNumber: '', building: '', room: '', physicalLocation: '', attachments: [],
});

const EOBC_REG = { nature: 'Grievance', category: 'Registration', subCategory: 'Delay in New Registration' };
const GST_RETURN = { nature: 'Application', category: 'GST', subCategory: 'Return' };

function seedTicket(o: {
  by: Who; daysAgo: number; status: TicketStatus; authenticator: string; patch: Partial<NewTicketInput>; desc: string; to?: string;
  steps?: [HistoryKind | AssignmentKind, Who, string?, Partial<Ev>?][];
}) {
  const input = { ...blankInput(), name: o.by.name, email: `${o.by.name.toLowerCase().replace(/ /g, '.')}@example.com`, description: o.desc, ...o.patch };
  const r = allRoutes.find((x) => x.authenticator === o.authenticator && x.nature === input.nature && x.category === input.category && x.subCategory === input.subCategory)!;
  const assigneeId = o.to ?? route(o.authenticator, input);
  const created = Date.now() - o.daysAgo * DAY;
  const t: Rec = {
    number: nextNumber(r.wing), creatorId: o.by.id, creatorName: o.by.name, createdAt: created,
    status: o.status, authenticator: o.authenticator, wing: r.wing, input, assigneeId, events: [],
  };
  const a = (w: Who) => ({ actorId: w.id, actorName: w.name, actorRole: w.role });
  add(t, 'created', a(o.by), '', {}, created);
  add(t, 'assigned', SYSTEM, '', { toId: assigneeId }, created + 1000);
  (o.steps ?? []).forEach(([k, w, text, extra], idx) => add(t, k, a(w), text ?? '', extra ?? {}, created + (idx + 1) * 3_600_000));
  const rv = t.events.filter((e) => e.kind === 'resolve').pop();
  if (rv && o.status === 'resolved') t.resolvedAt = rv.at;
  store.push(t);
}

export function resetTicketMock() {
  seqs.E = 0;
  seqs.H = 0;
  store = [];
  requests.clear();
  const arr = { arrNumber: 'AA3310250001234' };
  // Dealer (Demo Dealer): HelpDesk wing tickets land with the demo Admin (User3 / Assigning Officer)
  seedTicket({ by: DLR, authenticator: 'Dealer', daysAgo: 1, status: 'new', patch: { ...GST_RETURN, ...arr }, desc: 'GSTR-3B return page keeps loading and does not show the summary.' });
  seedTicket({ by: DLR, authenticator: 'Dealer', daysAgo: 6, status: 'inprogress', patch: { nature: 'Application', category: 'Others', subCategory: 'Payment' }, desc: 'Payment made but not reflected in the cash ledger.',
    steps: [['started', ADM]] });
  seedTicket({ by: DLR, authenticator: 'Dealer', daysAgo: 15, status: 'resolved', patch: { nature: 'Application', category: 'GST', subCategory: 'Refund', ...arr }, desc: 'Refund application shows an error on submit.',
    steps: [['started', ADM], ['resolve', ADM, 'Application re-submitted from the back office.']] });
  seedTicket({ by: DLR, authenticator: 'Dealer', daysAgo: 12, status: 'withdrawn', patch: { nature: 'Application', category: 'VAT', subCategory: 'Login Issue' }, desc: 'Raised by mistake.', steps: [['withdraw', DLR, 'Raised by mistake.']] });
  seedTicket({ by: DLR, authenticator: 'Dealer', daysAgo: 4, status: 'onhold', patch: { nature: 'Grievance', category: 'Refund', subCategory: 'Non-Credit of Refund' }, desc: 'Sanctioned refund is not credited to the bank account.',
    steps: [['started', OFF], ['hold', OFF, 'Waiting for the bank realisation report.']] });
  // Officer (Demo Officer)
  seedTicket({ by: OFF, authenticator: 'Officer', daysAgo: 2, status: 'new', patch: { nature: 'Hardware', category: 'Printer', subCategory: 'HP', brand: 'HP', model: 'LaserJet 400', serialNumber: 'PR998877', attachments: [{ name: 'printer-label.pdf', size: 150000, kind: 'proof' }] }, desc: 'Printer in the section office gives a paper jam error repeatedly.' });
  seedTicket({ by: OFF, authenticator: 'Officer', daysAgo: 3, status: 'new', patch: { nature: 'Network', category: 'Sify', subCategory: '', building: 'Main Block', room: '204', physicalLocation: 'Second floor corridor switch' }, desc: 'No connectivity in room 204 since morning.' });
  seedTicket({ by: OFF, authenticator: 'Officer', daysAgo: 5, status: 'new', patch: { ...GST_RETURN, ...arr }, desc: 'Return summary not loading for a dealer.' });
  // Registered users (authenticator Others, EoBC wing): land with the Demo Officer (TC01)
  seedTicket({ by: REG, authenticator: 'Others', daysAgo: 1, status: 'new', patch: { ...EOBC_REG }, desc: 'New registration application pending for more than a month.' });
  seedTicket({ by: REG, authenticator: 'Others', daysAgo: 3, status: 'resolved', patch: { nature: 'Grievance', category: 'Refund', subCategory: 'Non-Issuance of RFD-02' }, desc: 'Acknowledgement not issued after refund application.',
    steps: [['started', OFF], ['resolve', OFF, 'RFD-02 issued.']] });
  seedTicket({ by: EXT, authenticator: 'Others', daysAgo: 20, status: 'new', patch: { nature: 'Grievance', category: 'Return Filing', subCategory: 'Amendment' }, desc: 'Amendment not accepted. Raised again after the first fix.',
    steps: [['started', OFF], ['resolve', OFF, 'Amendment processed.'], ['reopen', EXT, 'The amendment was reverted.'], ['assigned', SYS, '', { fromId: OFF.id, toId: OFF.id }]] });
  seedTicket({ by: EXT, authenticator: 'Others', daysAgo: 7, status: 'inprogress', patch: { nature: 'Grievance', category: 'Appeal', subCategory: 'Error in Filing of APL-01' }, desc: 'Unable to file APL-01 online.',
    steps: [['started', OFF], ['remark', OFF, 'Checked the logs; reproducing the issue.']] });
  seedTicket({ by: EXT, authenticator: 'Others', daysAgo: 8, status: 'onhold', patch: { nature: 'Complaints', category: 'Tax Evasion', subCategory: 'Manual Bill' }, desc: 'Shop issues manual bills only.', steps: [['started', OFF], ['hold', OFF, 'Awaiting inspection report.']] });
  seedTicket({ by: EXT, authenticator: 'Others', daysAgo: 25, status: 'resolved', patch: { ...EOBC_REG, subCategory: 'Amendment' }, desc: 'Amendment pending.', steps: [['started', OFF], ['resolve', OFF, 'Approved.']] });
  seedTicket({ by: EXT, authenticator: 'Others', daysAgo: 30, status: 'withdrawn', patch: { ...EOBC_REG }, desc: 'Duplicate of another ticket.', steps: [['withdraw', EXT, 'Duplicate request.']] });
  seedTicket({ by: EXT, authenticator: 'Others', daysAgo: 5, status: 'new', to: HELPDESK_ID, patch: { ...EOBC_REG, subCategory: 'Fraudulent Registration' }, desc: 'Suspected fraudulent registration.',
    steps: [['transferred', OFF, 'Needs routing review.', { fromId: OFF.id, toId: HELPDESK_ID }]] });
  // Ticket raised by the Help desk ticket creator on behalf of a caller
  seedTicket({ by: ADM, authenticator: 'Dealer', daysAgo: 3, status: 'new',
    patch: { callerType: 'Dealer', type: 'Query', source: 'Telephone', receivedDate: new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10), nature: 'Application', category: 'E-Invoice', subCategory: 'Login' },
    desc: 'Dealer called: unable to log in to the E-Invoice portal.' });
  // Extra tickets for the demo user so that pagination can be seen
  for (let n = 0; n < 9; n += 1) {
    seedTicket({ by: REG, authenticator: 'Others', daysAgo: 13 + n, status: n % 3 === 0 ? 'resolved' : 'new', patch: { nature: 'Grievance', category: 'Return Filing', subCategory: 'Technical Glitches' }, desc: `Return filing glitch, case ${n + 1}.`,
      steps: n % 3 === 0 ? [['started', OFF], ['resolve', OFF, 'Fixed.']] : [] });
  }
}
resetTicketMock();
