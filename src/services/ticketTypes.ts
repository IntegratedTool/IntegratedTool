/** Ticket API contracts. The server filters every response by the authenticated caller. */
import type { Prefill, UserKind } from './types';

export type TicketStatus = 'new' | 'inprogress' | 'onhold' | 'resolved' | 'closed' | 'withdrawn';
export const STATUSES: TicketStatus[] = ['new', 'inprogress', 'onhold', 'resolved', 'closed', 'withdrawn'];

export interface Option {
  id: string;
  label: string;
}

/** Which additional fields a classification needs (see utils/fieldRules.ts). */
export type FieldSet = 'none' | 'hardware' | 'network' | 'gst' | 'task';

/** One active row of the routing master, as the form needs it. The assignee is never sent to the browser. */
export interface RouteRow {
  authenticator: string;
  wing: string;
  nature: string;
  category: string;
  /** Empty when the category has no sub-categories (e.g. Network providers) */
  subCategory: string;
  fieldSet: FieldSet;
}

/** Limits the form applies; the server enforces the same values (Super Admin console). */
export interface FormLimits {
  minWords: number;
  maxWords: number;
  maxFiles: number;
  maxTotalMB: number;
  requireEmail: boolean;
  requireMobile: boolean;
  blockDuplicateNames: boolean;
}
export const DEFAULT_LIMITS: FormLimits = { minWords: 20, maxWords: 1000, maxFiles: 2, maxTotalMB: 10, requireEmail: true, requireMobile: false, blockDuplicateNames: true };

export interface TicketMasters {
  limits?: FormLimits;
  /** Help desk ticket creators raise tickets on behalf of callers: they pick the caller type and see Type, Source and Date received */
  creator: boolean;
  /** Caller types (authenticators) the signed-in user may raise for; one entry for ordinary users */
  callerTypes: Option[];
  routes: RouteRow[];
  /** Creator-only masters */
  types: Option[];
  sources: Option[];
  /** true while Type / Source values are the hard-coded prototype samples */
  isSample: boolean;
}

export interface AttachmentMeta {
  name: string;
  size: number;
  /** 'proof' = Device Serial Number Proof (hardware) */
  kind: 'proof' | 'other';
}

export interface NewTicketInput {
  /** Generated once per form; lets the server ignore a retried/duplicated submission */
  clientRequestId: string;
  /** Creators only: which kind of caller the ticket is for (the routing "authenticator"). Ignored for everyone else. */
  callerType: string;
  /** Creators only */
  type: string;
  source: string;
  /** YYYY-MM-DD, creators only */
  receivedDate: string;
  name: string;
  email: string;
  mobile: string;
  nature: string;
  category: string;
  subCategory: string;
  description: string;
  arrNumber: string;
  model2UserId: string;
  taskTransferDetails: string;
  brand: string;
  model: string;
  serialNumber: string;
  building: string;
  room: string;
  physicalLocation: string;
  attachments: AttachmentMeta[];
  /** Set after the server warned about a similar earlier case and the raiser confirmed this one is different */
  confirmNotDuplicate?: boolean;
}

export interface TicketSummary {
  number: string;
  wing: string;
  nature: string;
  category: string;
  subCategory: string;
  status: TicketStatus;
  createdAt: string;
  /** Only present for callers who work assigned tickets (Admin / Officer). Never sent to the person who raised the ticket. */
  assigneeName?: string;
  /** Latest reopening date; only present when the ticket has been reopened */
  lastReopenedAt?: string;
  /** Present ONLY for callers allowed to see it (Admin / Helpdesk-Assigning) */
  originalOrTransferred?: 'original' | 'transferred';
}

export type HistoryKind = 'created' | 'started' | 'remark' | 'comment' | 'hold' | 'resume' | 'resolve' | 'reopen' | 'withdraw' | 'close';
export type AssignmentKind = 'assigned' | 'reassigned' | 'transferred';
export type ActorRole = 'system' | 'admin' | 'helpdesk' | 'officer' | 'dealer' | 'registered';

export interface HistoryRow {
  at: string;
  kind: HistoryKind;
  /** Remark / reason entered by the actor (may be empty) */
  text: string;
  byName: string;
  byRole: ActorRole;
}

export interface AssignmentRow {
  at: string;
  kind: AssignmentKind;
  text: string;
  fromName?: string;
  toName?: string;
  byName: string;
  byRole: ActorRole;
}

export interface TicketDetail extends TicketSummary {
  /** Who the ticket was raised for (Dealer / Officer / Others) */
  callerType: string;
  creatorName: string;
  complainant: { name: string; email: string; mobile: string };
  /** Only present on tickets raised by a Help desk ticket creator */
  typeLabel?: string;
  sourceLabel?: string;
  receivedDate?: string;
  fieldSet: FieldSet;
  description: string;
  extra: Partial<
    Record<
      | 'arrNumber'
      | 'model2UserId'
      | 'taskTransferDetails'
      | 'brand'
      | 'model'
      | 'serialNumber'
      | 'building'
      | 'room'
      | 'physicalLocation',
      string
    >
  >;
  attachments: AttachmentMeta[];
  /** Permission-filtered Action History (no assignment events for unauthorised callers) */
  history: HistoryRow[];
  /** Only for Admin / Helpdesk-Assigning */
  assignmentHistory?: AssignmentRow[];
  /** Resolved cases: last moment the raiser may reopen, and when the case closes by itself (ISO) */
  reopenUntil?: string;
  autoClosesOn?: string;
  /** What this caller may do right now: the server is the authority, the UI just renders it */
  actions: {
    start: boolean;
    remark: boolean;
    hold: boolean;
    resume: boolean;
    resolve: boolean;
    reopen: boolean;
    withdraw: boolean;
    close: boolean;
    comment: boolean;
    sendToHelpdesk: boolean;
    reassign: boolean;
  };
}

export type ListKind =
  | 'mine'
  | 'assigned-new'
  | 'assigned-inprogress'
  | 'assigned-onhold'
  | 'assigned-resolved'
  | 'assigned-closed'
  | 'assigned-reopened'
  | 'helpdesk'
  /** Super Admin: every Resolved case waiting to be closed */
  | 'closure';

export interface TicketFilters {
  number: string;
  nature: string;
  category: string;
  status: TicketStatus | '';
  assignee: string;
  /** 'mine' list: restrict to tickets reopened at least once */
  reopenedOnly: boolean;
  /** Admin / Helpdesk only */
  originalTransferred: '' | 'original' | 'transferred';
}

export const emptyFilters = (): TicketFilters => ({
  number: '',
  nature: '',
  category: '',
  status: '',
  assignee: '',
  reopenedOnly: false,
  originalTransferred: '',
});

/** Values the list filters may offer: only what exists in the caller's own list. */
export interface FilterOptions {
  assignees: Option[];
  classes: { nature: string; category: string }[];
}

export interface TicketPage {
  items: TicketSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatedTicket {
  number: string;
  /** Only for callers who work assigned tickets */
  assigneeName?: string;
}

export type TicketAction =
  | { type: 'start' }
  | { type: 'remark'; text: string }
  | { type: 'hold'; reason: string }
  | { type: 'resume' }
  | { type: 'resolve'; details: string }
  | { type: 'reopen'; reason: string }
  | { type: 'withdraw'; reason: string }
  | { type: 'close'; remark: string }
  | { type: 'comment'; text: string }
  | { type: 'sendToHelpdesk'; reason: string }
  | { type: 'reassign'; assigneeId: string; reason: string };

export interface TicketApi {
  getMasters(): Promise<TicketMasters>;
  /** `files` are the real uploads (max two); the server validates them again from their bytes. */
  createTicket(input: NewTicketInput, files: File[]): Promise<CreatedTicket>;
  listTickets(list: ListKind, filters: TicketFilters, page: number): Promise<TicketPage>;
  getFilterOptions(list: ListKind): Promise<FilterOptions>;
  getTicket(number: string): Promise<TicketDetail>;
  /** `expectedStatus` rejects an outdated action when the ticket changed concurrently.
   *  Resolves to null when the caller no longer has access afterwards (e.g. after reassigning away). */
  act(number: string, expectedStatus: TicketStatus, action: TicketAction): Promise<TicketDetail | null>;
  /** Eligible officers for Send/Reassign; only for callers with the permission */
  getReassignTargets(): Promise<Option[]>;
}

export type { Prefill, UserKind };
