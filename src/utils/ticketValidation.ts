/** Ticket form validation shared by the form (usability) and the server / mock (authority). */
import { DEFAULT_LIMITS, type NewTicketInput, type RouteRow, type TicketMasters } from '../services/ticketTypes';
import { countWords, fileNameProblem, longTextOk, shortTextOk } from './inputPolicy';
import { EMAIL_RE, MOBILE_RE } from './validation';

export const MAX_FILES = 2;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg'] as const;

export type TicketErrorKey =
  | 'err.t.required'
  | 'err.t.email'
  | 'err.t.mobile'
  | 'err.t.blank'
  | 'err.t.master'
  | 'err.t.date'
  | 'err.t.fileType'
  | 'err.t.fileCount'
  | 'err.t.fileSize'
  | 'err.t.proof'
  | 'err.t.chars'
  | 'err.t.long'
  | 'err.t.minWords'
  | 'err.t.maxWords'
  | 'err.t.fileName'
  | 'err.t.fileDup';

/** Column sizes in the database: longer values are refused with a message instead of failing on save. */
export const FIELD_MAX: Partial<Record<keyof NewTicketInput, number>> = {
  name: 200, email: 200, mobile: 15, arrNumber: 100, model2UserId: 100, brand: 100, model: 100, serialNumber: 100,
  building: 150, room: 50, physicalLocation: 300, taskTransferDetails: 2000, description: 40000,
};

export const fileExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** Rows the caller may classify against: creators are limited to the chosen caller type. */
export function routesFor(m: TicketMasters, callerType: string): RouteRow[] {
  return m.creator ? m.routes.filter((r) => r.authenticator === callerType) : m.routes;
}

/** The single routing row that matches the selected classification (null when the combination is not valid). */
export function matchRoute(m: TicketMasters, i: Pick<NewTicketInput, 'callerType' | 'nature' | 'category' | 'subCategory'>): RouteRow | null {
  return routesFor(m, i.callerType).find((r) => r.nature === i.nature && r.category === i.category && r.subCategory === i.subCategory) ?? null;
}

/** Returns field -> error key. Hidden (non-applicable) fields are never required and never checked. */
export function validateNewTicket(i: NewTicketInput, m: TicketMasters, today = todayIst()): Record<string, TicketErrorKey> {
  const e: Record<string, TicketErrorKey> = {};
  const L = m.limits ?? DEFAULT_LIMITS;
  const LONG_FIELDS = ['taskTransferDetails', 'description'];
  const req = (k: keyof NewTicketInput, ok = true) => {
    const v = i[k];
    if (typeof v === 'string' ? !v.trim() : !v) e[k] = 'err.t.required';
    else if (!ok) e[k] = 'err.t.master';
    else if (typeof v === 'string') checkText(k, v);
  };
  // Length and character policy for every typed value (also applied to optional fields when filled in).
  const checkText = (k: keyof NewTicketInput, v: string) => {
    if (e[k]) return;
    if (v.length > (FIELD_MAX[k] ?? 300)) e[k] = 'err.t.long';
    else if (!(LONG_FIELDS.includes(k) ? longTextOk(v) : shortTextOk(v))) e[k] = 'err.t.chars';
  };

  if (m.creator) {
    req('callerType', m.callerTypes.some((c) => c.id === i.callerType));
    req('type', m.types.some((t) => t.id === i.type));
    req('source', m.sources.some((s) => s.id === i.source));
    if (!i.receivedDate) e.receivedDate = 'err.t.required';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(i.receivedDate) || Number.isNaN(Date.parse(i.receivedDate)) || i.receivedDate > today) e.receivedDate = 'err.t.date';
  }

  req('name');
  if (!i.email.trim()) { if (L.requireEmail) e.email = 'err.t.required'; }
  else if (!EMAIL_RE.test(i.email.trim()) || i.email.length > FIELD_MAX.email!) e.email = 'err.t.email';
  if (!i.mobile) { if (L.requireMobile) e.mobile = 'err.t.required'; }
  else if (!MOBILE_RE.test(i.mobile)) e.mobile = 'err.t.mobile';

  // Classification: the selected combination must be an active route for this caller type.
  const pool = routesFor(m, i.callerType);
  const natures = new Set(pool.map((r) => r.nature));
  req('nature', natures.has(i.nature));
  const cats = new Set(pool.filter((r) => r.nature === i.nature).map((r) => r.category));
  if (!e.nature) req('category', cats.has(i.category));
  if (!e.nature && !e.category) {
    const subs = pool.filter((r) => r.nature === i.nature && r.category === i.category).map((r) => r.subCategory);
    if (subs.some((s) => s !== '')) req('subCategory', subs.includes(i.subCategory));
  }
  const route = e.nature || e.category || e.subCategory ? null : matchRoute(m, i);

  switch (route?.fieldSet) {
    case 'gst':
      req('arrNumber');
      break;
    case 'task':
      req('model2UserId');
      req('taskTransferDetails');
      break;
    case 'hardware':
      req('brand');
      req('model');
      req('serialNumber');
      break;
    case 'network':
      req('building');
      req('room');
      req('physicalLocation');
      break;
  }

  if (!i.description.trim()) e.description = 'err.t.blank';
  else {
    checkText('description', i.description);
    const w = countWords(i.description);
    if (!e.description && w < L.minWords) e.description = 'err.t.minWords';
    else if (!e.description && w > L.maxWords) e.description = 'err.t.maxWords';
  }
  for (const k of ['arrNumber', 'model2UserId', 'taskTransferDetails', 'brand', 'model', 'serialNumber', 'building', 'room', 'physicalLocation'] as const) {
    if (i[k] && !e[k]) checkText(k, i[k]);
  }

  const names = i.attachments.map((a) => a.name.trim().toLowerCase());
  if (i.attachments.length > L.maxFiles) e.attachments = 'err.t.fileCount';
  else if (i.attachments.some((a) => fileNameProblem(a.name))) e.attachments = 'err.t.fileName';
  else if (i.attachments.some((a) => !(ALLOWED_EXT as readonly string[]).includes(fileExt(a.name)))) e.attachments = 'err.t.fileType';
  else if (L.blockDuplicateNames && new Set(names).size !== names.length) e.attachments = 'err.t.fileDup';
  else if (i.attachments.reduce((n, a) => n + a.size, 0) > L.maxTotalMB * 1024 * 1024) e.attachments = 'err.t.fileSize';
  else if (route?.fieldSet === 'hardware' && !i.attachments.some((a) => a.kind === 'proof')) e.attachments = 'err.t.proof';
  return e;
}
