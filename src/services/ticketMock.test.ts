import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, startSession } from './mockSession';
import { resetTicketMock, ticketMock as api } from './ticketMock';
import { emptyFilters, type NewTicketInput } from './ticketTypes';
import { ApiError } from './types';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ApiError ? e.code : 'OTHER';
  }
  return null;
};
const asDealer = () => startSession('dealer', 'dealer:33ABCDE1234F1Z7', 'Demo Dealer');
const asOfficer = () => startSession('officer', 'officer-0012345', 'Demo Officer');
const asUser = () => startSession('registered', 'reg:user.demo@example.com', 'Demo User');
const asAdmin = () => startSession('admin', 'admin-helpdesk', 'Admin Helpdesk');

/** 22 random lower-case words, so the repeated-case check stays quiet between tests. */
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const uniqueText = () => Array.from({ length: 22 }, word).join(' ');
const base = (o: Partial<NewTicketInput> = {}): NewTicketInput => ({
  clientRequestId: 'r1', callerType: '', type: '', source: '', receivedDate: '', name: 'A Kumar', email: 'a@example.com', mobile: '',
  nature: 'Application', category: 'GST', subCategory: 'Return', description: uniqueText(), arrNumber: 'AA1', model2UserId: '', taskTransferDetails: '',
  brand: '', model: '', serialNumber: '', building: '', room: '', physicalLocation: '', attachments: [], ...o,
});

beforeEach(() => {
  resetTicketMock();
  clearSession();
});

describe('masters', () => {
  it('requires a session', async () => {
    expect(await code(api.getMasters())).toBe('UNAUTHENTICATED');
  });
  it('gives ordinary users only their own caller type and no creator lists', async () => {
    asDealer();
    const m = await api.getMasters();
    expect(m.creator).toBe(false);
    expect(m.callerTypes.map((c) => c.id)).toEqual(['Dealer']);
    expect(m.routes.every((r) => r.authenticator === 'Dealer')).toBe(true);
    expect(m.routes.some((r) => r.nature === 'Hardware')).toBe(false);
    expect(m.types).toEqual([]);
  });
  it('gives an admin every caller type plus Type and Source lists', async () => {
    asAdmin();
    const m = await api.getMasters();
    expect(m.creator).toBe(true);
    expect(m.callerTypes.map((c) => c.id)).toEqual(['Dealer', 'Officer', 'Others']);
    expect(m.types.length).toBeGreaterThan(0);
    expect(m.sources.length).toBeGreaterThan(0);
  });
});

describe('creation and routing', () => {
  it('requires a session', async () => {
    expect(await code(api.createTicket(base(), []))).toBe('UNAUTHENTICATED');
  });
  it('HelpDesk wing gets an H number, routed by the routing table, and a retry makes no duplicate', async () => {
    asDealer();
    const a = await api.createTicket(base(), []);
    expect(a.number).toMatch(/^H\d{6}$/);
    expect(a).not.toHaveProperty('assigneeName'); // dealers are never told who it was assigned to
    expect((await api.getTicket(a.number)).assigneeName).toBeUndefined();
    expect((await api.createTicket(base(), [])).number).toBe(a.number);
  });
  it('EoBC wing gets an E number', async () => {
    asDealer();
    const a = await api.createTicket(base({ nature: 'Grievance', category: 'Registration', subCategory: 'Delay in New Registration', arrNumber: '' }), []);
    expect(a.number).toMatch(/^E\d{6}$/);
    expect(a).not.toHaveProperty('assigneeName');
  });
  it('rejects a classification that is not an active route for the caller', async () => {
    asDealer();
    expect(await code(api.createTicket(base({ nature: 'Hardware', category: 'Printer', subCategory: 'HP' }), []))).toBe('VALIDATION'); // officer-only
    expect(await code(api.createTicket(base({ subCategory: 'Not a real value' }), []))).toBe('VALIDATION');
  });
  it('shows additional fields by classification: GST needs ARR, hardware needs fields and a proof, network no sub category', async () => {
    asDealer();
    expect(await code(api.createTicket(base({ arrNumber: ' ' }), []))).toBe('VALIDATION');
    asOfficer();
    const hw = base({ nature: 'Hardware', category: 'Printer', subCategory: 'HP', arrNumber: '', brand: 'HP', model: 'M1', serialNumber: 'S1' });
    expect(await code(api.createTicket(hw, []))).toBe('VALIDATION'); // no proof
    const ok = await api.createTicket({ ...hw, attachments: [{ name: 'p.pdf', size: 10, kind: 'proof' }] }, []);
    expect(ok.number).toMatch(/^H/);
    const net = base({ clientRequestId: 'r2', nature: 'Network', category: 'Sify', subCategory: '', arrNumber: '', building: 'B', room: '1', physicalLocation: 'x' });
    expect((await api.createTicket(net, [])).number).toMatch(/^H/);
  });
  it('limits attachments to two files of PDF/JPG/JPEG within 10 MB', async () => {
    asDealer();
    const att = (n: string, size = 10) => ({ name: n, size, kind: 'other' as const });
    expect(await code(api.createTicket(base({ attachments: [att('a.pdf'), att('b.pdf'), att('c.pdf')] }), []))).toBe('VALIDATION');
    expect(await code(api.createTicket(base({ attachments: [att('a.docx')] }), []))).toBe('VALIDATION');
    expect(await code(api.createTicket(base({ attachments: [att('a.pdf', 11 * 1024 * 1024)] }), []))).toBe('VALIDATION');
  });
  it('stores only the fields of the selected classification', async () => {
    asDealer();
    const made = await api.createTicket(base({ brand: 'Leftover', building: 'Leftover' }), []);
    const d = await api.getTicket(made.number);
    expect(d.extra).toEqual({ arrNumber: 'AA1' });
  });
});

describe('access and restricted information', () => {
  it('only the creator or current assignee can open a ticket; others get the same error as a missing one', async () => {
    asDealer();
    const t = await api.createTicket(base(), []);
    asUser();
    expect(await code(api.getTicket(t.number))).toBe('FORBIDDEN');
    expect(await code(api.getTicket('H999999'))).toBe('FORBIDDEN');
  });
  it('Original/Transferred and assignment history exist only for Admin', async () => {
    asDealer();
    const mine = await api.listTickets('mine', emptyFilters(), 1);
    expect('originalOrTransferred' in mine.items[0]).toBe(false);
    expect((await api.getTicket(mine.items[0].number)).assignmentHistory).toBeUndefined();
    asAdmin();
    const own = await api.listTickets('assigned-new', emptyFilters(), 1);
    expect(own.items[0].originalOrTransferred).toBeDefined();
    expect((await api.getTicket(own.items[0].number)).assignmentHistory).toBeDefined();
  });
  it('filter options only contain values from the caller’s own list', async () => {
    asDealer();
    const o = await api.getFilterOptions('mine');
    expect(o.classes.length).toBeGreaterThan(0);
    expect(o.classes.every((c) => c.nature !== 'Hardware')).toBe(true);
  });
});

describe('workflow', () => {
  it('assignee starts and resolves; creator reopens and it is routed again', async () => {
    asDealer();
    const t = await api.createTicket(base(), []);
    asAdmin();
    let d = (await api.act(t.number, 'new', { type: 'start' }))!;
    expect(d.status).toBe('inprogress');
    expect(await code(api.act(t.number, 'new', { type: 'start' }))).toBe('INVALID_STATE');
    d = (await api.act(t.number, 'inprogress', { type: 'resolve', details: 'Fixed' }))!;
    expect(d.status).toBe('resolved');
    asDealer();
    expect(await code(api.act(t.number, 'resolved', { type: 'reopen', reason: ' ' }))).toBe('VALIDATION');
    d = (await api.act(t.number, 'resolved', { type: 'reopen', reason: 'Still failing' }))!;
    expect(d.status).toBe('new');
    expect(d).not.toHaveProperty('assigneeName'); // the dealer who reopened it does not see the assignee
  });
  it('reassigning moves access to the new assignee and removes it from the old one', async () => {
    asAdmin();
    const first = (await api.listTickets('assigned-new', emptyFilters(), 1)).items.find((i) => i.number.startsWith('H'))!;
    const targets = await api.getReassignTargets();
    const to = targets.find((x) => x.label === 'Demo Officer')!;
    expect((await api.act(first.number, 'new', { type: 'reassign', assigneeId: to.id, reason: 'Workload' }))?.assigneeName).toBe('Demo Officer');
    // The demo admin is also the Super Admin (read-any), so check the work list rather than direct access.
    expect((await api.listTickets('assigned-new', emptyFilters(), 1)).items.some((i) => i.number === first.number)).toBe(false);
    asOfficer();
    expect((await api.getTicket(first.number)).assigneeName).toBe('Demo Officer');
  });
  it('a withdrawn ticket is final', async () => {
    asDealer();
    const t = await api.createTicket(base(), []);
    await api.act(t.number, 'new', { type: 'withdraw', reason: 'Mistake' });
    expect(await code(api.act(t.number, 'withdrawn', { type: 'reopen', reason: 'x' }))).toBe('FORBIDDEN');
  });
});

describe('admin raising', () => {
  it('requires the caller type, Type and Source', async () => {
    asAdmin();
    expect(await code(api.createTicket(base({ callerType: 'Dealer' }), []))).toBe('VALIDATION');
    await expect(api.createTicket(base({ callerType: 'Dealer', type: 'Query', source: 'Telephone', receivedDate: new Date().toISOString().slice(0, 10) }), [])).resolves.toBeTruthy();
  });
});

describe('lifecycle rules', () => {
  afterEach(() => vi.useRealTimers());
  const resolved = async () => {
    asDealer();
    const t = await api.createTicket(base(), []);
    asAdmin();
    await api.act(t.number, 'new', { type: 'start' });
    await api.act(t.number, 'inprogress', { type: 'resolve', details: 'Fixed' });
    return t.number;
  };
  it('withdraw works only while New, and only for the raiser', async () => {
    asDealer();
    const a = await api.createTicket(base(), []);
    const b = await api.createTicket(base({ clientRequestId: 'r2' }), []);
    asAdmin();
    await api.act(b.number, 'new', { type: 'start' });
    asDealer();
    expect(await code(api.act(b.number, 'inprogress', { type: 'withdraw', reason: 'x' }))).toBe('FORBIDDEN');
    const d = (await api.act(a.number, 'new', { type: 'withdraw', reason: 'Raised twice' }))!;
    expect(d.status).toBe('withdrawn');
  });
  it('only the closer can close a Resolved ticket; the raiser cannot', async () => {
    const n = await resolved();
    asDealer();
    expect(await code(api.act(n, 'resolved', { type: 'close', remark: '' }))).toBe('FORBIDDEN');
    asAdmin();
    expect((await api.act(n, 'resolved', { type: 'close', remark: '' }))!.status).toBe('closed');
  });
  it('reopen is refused after the reopen window', async () => {
    const n = await resolved();
    asDealer();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(await code(api.act(n, 'resolved', { type: 'reopen', reason: 'Late' }))).toBe('FORBIDDEN');
  });
  it('comments are added to the history, latest first', async () => {
    asDealer();
    const t = await api.createTicket(base(), []);
    await api.act(t.number, 'new', { type: 'comment', text: 'More information' });
    const d = await api.getTicket(t.number);
    expect(d.history[0].kind).toBe('comment');
    expect(d.history[d.history.length - 1].kind).toBe('created');
  });
  it('a near-identical second case is flagged unless the raiser confirms', async () => {
    asDealer();
    const text = base().description;
    await api.createTicket(base({ description: text, clientRequestId: 'a' }), []);
    expect(await code(api.createTicket(base({ description: text + ' again', clientRequestId: 'b' }), []))).toBe('DUPLICATE_SUSPECTED');
    await expect(api.createTicket(base({ description: text + ' again', clientRequestId: 'b', confirmNotDuplicate: true }), [])).resolves.toBeTruthy();
  });
  it('rejects short, long and special-character case details', async () => {
    asDealer();
    expect(await code(api.createTicket(base({ description: 'too short' }), []))).toBe('VALIDATION');
    expect(await code(api.createTicket(base({ description: base().description + ' <script>' }), []))).toBe('VALIDATION');
    expect(await code(api.createTicket(base({ description: Array(1001).fill('word').join(' ') }), []))).toBe('VALIDATION');
  });
});
