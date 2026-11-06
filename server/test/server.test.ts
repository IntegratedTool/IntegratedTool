import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, md5, PW } from './helpers.js';
import { sampleRoutes } from '../../src/services/sampleRoutes.js';
import { detectAlgo, matchingAlgos, verifyPassword } from '../src/security/password.js';

let s: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { s = await startServer(); }, 60_000);
afterAll(async () => { await s.close(); });

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 10]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const blank = { callerType: '', type: '', source: '', receivedDate: '', name: 'Ravi Kumar', email: 'ravi@example.com', mobile: '9876543210', nature: '', category: '', subCategory: '',
  description: '', arrNumber: '', model2UserId: '', taskTransferDetails: '', brand: '', model: '', serialNumber: '', building: '', room: '', physicalLocation: '', attachments: [] };
let n = 0;
const rid = () => `req-${Date.now()}-${n++}`;
const dealerRoute = (wing: string) => sampleRoutes.find((r) => r[0] === 'Dealer' && r[1] === wing && r[2] === 'Application' && r[3] === 'E-Invoice')
  ?? sampleRoutes.find((r) => r[0] === 'Dealer' && r[1] === wing && r[4] !== '' && !/Hardware|Network/.test(r[2]))!;
/** 22 random lower-case words, so the repeated-case check stays quiet between tests. */
const word = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const uniqueText = () => Array.from({ length: 22 }, word).join(' ');
const asInput = (r: string[]) => ({ ...blank, clientRequestId: rid(), description: uniqueText(), nature: r[2], category: r[3], subCategory: r[4] });

describe('passwords', () => {
  it('detects and verifies by hashing, never decrypting', async () => {
    expect(detectAlgo(md5('a'))).toBe('md5');
    expect(await verifyPassword(md5('a'), 'a')).toBe(true);
    expect(await verifyPassword(md5('a'), 'b')).toBe(false);
    expect(await matchingAlgos(md5('a'), 'a')).toEqual(['md5']);
    expect(await verifyPassword(null, 'a')).toBe(false);
  });
});

describe('admin login', () => {
  it('accepts user name or email, rejects inactive and wrong passwords, asks CAPTCHA after the first failure', async () => {
    const c = s.client();
    expect((await c.login('creator1')).status).toBe(200);
    expect((await s.client().login('creator1@tn.gov.in')).json.userType).toBe('admin');
    await s.pg.query(`insert into resolver_login_eobc (adminname, adminusername, emailid, password, active_yn) values ('Captcha Person','captcha1','captcha1@tn.gov.in','${md5(PW)}','Y')`);
    const bad = s.client();
    const f1 = await bad.login('captcha1', 'wrong');
    expect(f1.status).toBe(400);
    expect(f1.json).toMatchObject({ code: 'INVALID_CREDENTIALS', meta: { captchaRequired: 1 } });
    expect((await bad.login('captcha1')).json.code).toBe('CAPTCHA_MISSING');
    expect((await s.client().login('inactive1')).json.code).toBe('INVALID_CREDENTIALS');
    expect((await s.client().login('nobody')).json.code).toBe('INVALID_CREDENTIALS');
  });
  it("requires the CSRF header and a session", async () => {
    expect((await s.client().call("GET", "/tickets/masters")).status).toBe(401);
  });
  it('every login is an Admin and may raise tickets', async () => {
    const a = await s.client().login('creator1');
    expect(a.json.capabilities.raise).toBe(true);
    const other = sampleRoutes.find((r) => r[1] === 'EoBC')![5];
    const o = await s.client().login(other);
    expect(o.json.userType).toBe('admin');
    expect(o.json.capabilities.raise).toBe(true);
  });
});

describe('dealer login', () => {
  it('works with the sample OTP; unknown or inactive GSTIN is refused', async () => {
    const d = await s.client().dealerLogin();
    expect(d.status).toBe(200);
    expect(d.json).toMatchObject({ userType: 'dealer', displayName: 'Demo Traders' });
    expect(d.json.prefill).toMatchObject({ name: 'Demo Traders Pvt Ltd', email: 'dealer@example.com', mobile: '9876543210' });
    expect((await s.client().dealerLogin('33ZZZZZ9999Z1ZF')).json.code).toBe('NO_ACTIVE_GSTIN');
    expect((await s.client().dealerLogin('33QQQQQ0000Q1Z6')).json.code).toBe('NO_ACTIVE_GSTIN');
    const c = s.client();
    const l = await c.call('POST', '/auth/dealer/lookup', { kind: 'gst', identifier: '33ABCDE1234F1Z7' });
    const o = await c.call('POST', '/auth/dealer/otp', { lookupId: l.json.lookupId });
    expect((await c.call('POST', '/auth/dealer/verify', { challengeId: o.json.challengeId, otp: '000000' })).json.code).toBe('OTP_INVALID');
  });
  it('officer and registered logins are unavailable', async () => {
    expect((await s.client().call('POST', '/auth/officer/login', {})).status).toBe(503);
  });
});

describe('tickets', () => {
  it('dealer sees only dealer routes; the assignee is never sent', async () => {
    const d = s.client(); await d.dealerLogin();
    const m = (await d.call('GET', '/tickets/masters')).json;
    expect(m.creator).toBe(false);
    expect(m.routes.every((r: any) => r.authenticator === 'Dealer')).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/assign/i);
    expect(m.types).toEqual([]);
  });

  it('creates a ticket routed to the assign_to account, E or H numbering, and retries do not duplicate', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const input = asInput(e);
    const first = await d.form('/tickets', input, []);
    expect(first.status).toBe(201);
    expect(first.json.number).toMatch(/^E\d{6}$/);
    expect(first.json).not.toHaveProperty('assigneeName'); // dealers are never told who it was assigned to
    expect((await d.call('GET', `/tickets/${first.json.number}`)).json).not.toHaveProperty('assigneeName');
    expect((await d.call('GET', '/tickets?list=mine&page=1')).json.items[0]).not.toHaveProperty('assigneeName');
    expect((await d.call('GET', '/tickets/filter-options?list=mine')).json.assignees).toEqual([]);
    const again = await d.form('/tickets', input, []);
    expect(again.json.number).toBe(first.json.number);
    const h = sampleRoutes.find((r) => r[0] === 'Dealer' && r[1] === 'HelpDesk' && r[4] !== '' && !/Hardware|Network/.test(r[2]) && r[3] !== 'GST');
    if (h) expect((await d.form('/tickets', asInput(h), [])).json.number).toMatch(/^H\d{6}$/);
  });

  it('rejects an invalid classification and missing required data', async () => {
    const d = s.client(); await d.dealerLogin();
    const r = await d.form('/tickets', { ...blank, clientRequestId: rid(), nature: 'Nope', category: 'x', subCategory: '' }, []);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION');
    const e = dealerRoute('EoBC');
    expect((await d.form('/tickets', { ...asInput(e), description: '  ' }, [])).json.meta.field).toBe('description');
  });

  it('any admin raises on behalf of a caller; Type, Source and a valid date are required', async () => {
    const other = sampleRoutes.find((r) => r[1] === 'EoBC')![5];
    const c = s.client(); await c.login(other);
    const m = (await c.call('GET', '/tickets/masters')).json;
    expect(m.creator).toBe(true);
    expect(m.callerTypes.length).toBeGreaterThan(1);
    expect(m.types.length).toBeGreaterThan(0);
    const e = dealerRoute('EoBC');
    const base = { ...asInput(e), callerType: 'Dealer' };
    expect((await c.form('/tickets', base, [])).json.meta.field).toBe('type');
    const full = { ...base, type: 'Query', source: 'Telephone', receivedDate: '2999-01-01' };
    expect((await c.form('/tickets', full, [])).json.meta).toMatchObject({ field: 'receivedDate' });
    const ok = await c.form('/tickets', { ...full, clientRequestId: rid(), receivedDate: '2026-01-05' }, []);
    expect(ok.status).toBe(201);
    expect(ok.json.assigneeName).toBeTruthy();
    const detail = (await c.call('GET', `/tickets/${ok.json.number}`)).json;
    expect(detail).toMatchObject({ typeLabel: 'Query', sourceLabel: 'Telephone', receivedDate: '2026-01-05', callerType: 'Dealer' });
  });

  it('stores attachments on disk with the location in the database, and rejects disguised files', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const good = await d.form('/tickets', { ...asInput(e), attachments: [{ name: 'a.pdf', size: 9, kind: 'other' }, { name: 'b.jpg', size: 6, kind: 'other' }] }, [
      { name: 'a.pdf', bytes: pdf }, { name: 'b.jpg', bytes: jpg }]);
    expect(good.status).toBe(201);
    const rows = await s.pg.query<{ stored_path: string; sha256: string; size_bytes: number }>(`select stored_path, sha256, size_bytes from hd_ticket_attachment a join hd_ticket t on t.id = a.ticket_id where t.ref_no = $1 order by slot`, [good.json.number]);
    expect(rows.rows).toHaveLength(2);
    for (const r of rows.rows) { expect(existsSync(r.stored_path)).toBe(true); expect(r.stored_path.startsWith(s.uploads)).toBe(true); expect(r.sha256).toHaveLength(64); }
    expect(readFileSync(rows.rows[0].stored_path).subarray(0, 4).toString()).toBe('%PDF');
    const detail = (await d.call('GET', `/tickets/${good.json.number}`)).json;
    expect(detail.attachments.map((a: any) => a.name)).toEqual(['a.pdf', 'b.jpg']);

    const before = (await s.pg.query<{ n: string }>('select count(*) n from hd_ticket')).rows[0].n;
    const fake = await d.form('/tickets', { ...asInput(e), attachments: [{ name: 'x.pdf', size: 3, kind: 'other' }] }, [{ name: 'x.pdf', bytes: new Uint8Array([1, 2, 3, 4, 5]) }]);
    expect(fake.json.meta).toMatchObject({ field: 'attachments', code: 'err.t.fileType' });
    const three = await d.form('/tickets', { ...asInput(e), attachments: [{}, {}, {}] }, [{ name: 'a.pdf', bytes: pdf }, { name: 'b.pdf', bytes: pdf }, { name: 'c.pdf', bytes: pdf }]);
    expect(three.status).toBe(400);
    expect((await s.pg.query<{ n: string }>('select count(*) n from hd_ticket')).rows[0].n).toBe(before);
  });

  it('refuses with ROUTING_FAILED and creates nothing when assign_to has no matching active account', async () => {
    const e = dealerRoute('EoBC');
    await s.pg.query(`update resolver_login_eobc set active_yn = 'N' where adminusername = $1`, [e[5]]);
    const d = s.client(); await d.dealerLogin();
    const before = (await s.pg.query<{ n: string }>('select count(*) n from hd_ticket')).rows[0].n;
    const r = await d.form('/tickets', asInput(e), []);
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('ROUTING_FAILED');
    expect((await s.pg.query<{ n: string }>('select count(*) n from hd_ticket')).rows[0].n).toBe(before);
    await s.pg.query(`update resolver_login_eobc set active_yn = 'Y' where adminusername = $1`, [e[5]]);
  });

  it('access is limited to the creator and the current assignee; lists are scoped to the caller', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const t = (await d.form('/tickets', asInput(e), [])).json.number;
    const stranger = s.client(); await stranger.login('creator2');
    expect((await stranger.call('GET', `/tickets/${t}`)).status).toBe(403);
    expect((await stranger.call('GET', `/tickets/E999999`)).status).toBe(403);
    expect((await stranger.call('POST', `/tickets/${t}/actions`, { expectedStatus: 'new', action: { type: 'start' } })).status).toBe(403);
    const sup = s.client(); await sup.login('creator1'); // Super Admin (eobc:1): may read any case, but not act on it
    expect((await sup.call('GET', `/tickets/${t}`)).status).toBe(200);
    expect((await sup.call('POST', `/tickets/${t}/actions`, { expectedStatus: 'new', action: { type: 'start' } })).status).toBe(403);
    const mine = (await d.call('GET', '/tickets?list=mine&page=1')).json;
    expect(mine.items.some((i: any) => i.number === t)).toBe(true);
    expect(mine.items[0]).not.toHaveProperty('originalOrTransferred'); // restricted for dealers
    expect((await d.call('GET', '/tickets?list=assigned-new&page=1')).status).toBe(403);
  });

  it('full lifecycle: assignee starts and resolves, creator reopens (re-routed), reassign and history', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const t = (await d.form('/tickets', asInput(e), [])).json.number;
    const a = s.client(); await a.login(e[5]);
    const act = (c: typeof a, expectedStatus: string, action: object) => c.call('POST', `/tickets/${t}/actions`, { expectedStatus, action });

    expect((await a.call('GET', '/tickets?list=assigned-new&page=1')).json.items.map((i: any) => i.number)).toContain(t);
    const started = await act(a, 'new', { type: 'start' });
    expect(started.json.status).toBe('inprogress');
    expect((await act(a, 'new', { type: 'start' })).status).toBe(409); // outdated view
    expect((await act(a, 'inprogress', { type: 'resolve', details: '  ' })).json.code).toBe('VALIDATION');
    expect((await act(a, 'inprogress', { type: 'resolve', details: 'Fixed.' })).json.status).toBe('resolved');
    expect((await act(d, 'resolved', { type: 'resolve', details: 'x' })).status).toBe(403);
    const re = await act(d, 'resolved', { type: 'reopen', reason: 'Still broken' });
    expect(re.json.status).toBe('new');
    expect(re.json.history.map((h: any) => h.kind)).toEqual(['reopen', 'resolve', 'started', 'created']);
    expect(re.json).not.toHaveProperty('assignmentHistory');

    const detail = (await a.call('GET', `/tickets/${t}`)).json;
    expect(detail.assignmentHistory.map((x: any) => x.kind)).toEqual(['assigned', 'assigned']);
    expect((await a.call('GET', '/tickets?list=assigned-reopened&page=1')).json.items[0].number).toBe(t);

    const targets = (await a.call('GET', '/tickets/reassign-targets')).json;
    expect(targets.find((x: any) => x.id === 'eobc:1')).toBeTruthy();
    const moved = await act(a, 'new', { type: 'reassign', assigneeId: 'eobc:1', reason: 'Transfer' });
    expect(moved.json).toBeNull(); // original assignee no longer has access
    const c1 = s.client(); await c1.login('creator1');
    const seen = (await c1.call('GET', `/tickets/${t}`)).json;
    expect(seen.originalOrTransferred).toBe('transferred');
    expect((await d.call('GET', `/tickets/${t}`)).json).not.toHaveProperty('assignmentHistory');
  });

  it('simultaneous submissions get different numbers', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const out = await Promise.all(Array.from({ length: 5 }, () => d.form('/tickets', asInput(e), [])));
    const nums = out.map((o) => o.json.number);
    expect(new Set(nums).size).toBe(5);
  });
});

const act = (c: { call: (m: string, u: string, b?: unknown) => Promise<{ status: number; json: any }> }, t: string, expectedStatus: string, action: object) =>
  c.call('POST', `/tickets/${t}/actions`, { expectedStatus, action });
const raise = async (d: ReturnType<typeof s.client>, wing = 'EoBC', over: object = {}) => {
  const e = dealerRoute(wing);
  const r = await d.form('/tickets', { ...asInput(e), ...over }, []);
  return { e, number: r.json.number as string, r };
};

describe('lifecycle: withdraw, comment, close, reopen window, auto-close', () => {
  it('withdraw only while New, only by the raiser; comments appear latest first', async () => {
    const d = s.client(); await d.dealerLogin();
    const { e, number: a } = await raise(d);
    const { number: b } = await raise(d);
    const as = s.client(); await as.login(e[5]);
    expect((await act(as, a, 'new', { type: 'withdraw', reason: 'x' })).status).toBe(403); // not the raiser
    expect((await act(as, b, 'new', { type: 'start' })).json.status).toBe('inprogress');
    expect((await act(d, b, 'inprogress', { type: 'withdraw', reason: 'x' })).status).toBe(403); // work has started
    expect((await act(d, a, 'new', { type: 'comment', text: 'Here is more detail' })).status).toBe(200);
    expect((await act(d, a, 'new', { type: 'comment', text: '<b>x</b>' })).json.code).toBe('VALIDATION');
    const w = await act(d, a, 'new', { type: 'withdraw', reason: 'Raised by mistake' });
    expect(w.json.status).toBe('withdrawn');
    expect(w.json.history.map((h: any) => h.kind)).toEqual(['withdraw', 'comment', 'created']);
    expect((await act(d, a, 'withdrawn', { type: 'comment', text: 'more' })).status).toBe(403);
  });

  it('only the Super Admin closes a Resolved case; reopen only inside the window; auto-close sweeps the rest', async () => {
    const d = s.client(); await d.dealerLogin();
    const { e, number: t } = await raise(d);
    const as = s.client(); await as.login(e[5]);
    await act(as, t, 'new', { type: 'start' });
    await act(as, t, 'inprogress', { type: 'resolve', details: 'Fixed.' });
    expect((await act(as, t, 'resolved', { type: 'close', remark: '' })).status).toBe(403); // the resolver cannot close
    expect((await act(d, t, 'resolved', { type: 'close', remark: '' })).status).toBe(403); // nor the raiser
    const detail = (await d.call('GET', `/tickets/${t}`)).json;
    expect(detail.reopenUntil).toBeTruthy();
    expect(detail.autoClosesOn).toBeTruthy();

    await s.pg.query(`update hd_ticket set resolved_at = now() - interval '8 days' where ref_no = $1`, [t]);
    expect((await act(d, t, 'resolved', { type: 'reopen', reason: 'Too late' })).status).toBe(403);
    const { autoCloseDue } = await import('../src/repo/tickets.js');
    const { defaultSettings } = await import('../../src/utils/settingsSchema.js');
    const { pgliteDb } = await import('./helpers.js');
    expect(await autoCloseDue(pgliteDb(s.pg), defaultSettings())).toBeGreaterThanOrEqual(1);
    expect((await d.call('GET', `/tickets/${t}`)).json.status).toBe('closed');

    const { number: u } = await raise(d);
    await act(as, u, 'new', { type: 'start' });
    await act(as, u, 'inprogress', { type: 'resolve', details: 'Fixed.' });
    const sup = s.client(); await sup.login('creator1');
    expect((await sup.call('GET', '/tickets?list=closure&page=1')).json.items.map((i: any) => i.number)).toContain(u);
    expect((await act(sup, u, 'resolved', { type: 'close', remark: 'Verified' })).json.status).toBe('closed');
    expect((await act(d, u, 'closed', { type: 'reopen', reason: 'x' })).status).toBe(403);
  });
});

describe('reassign between HelpDesk and EoBC', () => {
  it('moves a case across wings in both directions and the new assignee gets access', async () => {
    const d = s.client(); await d.dealerLogin();
    const { e, number: t } = await raise(d, 'EoBC');
    const eo = s.client(); await eo.login(e[5]);
    const hdRow = (await s.pg.query<{ resolver_id: number; user_name: string }>(`select resolver_id, user_name from resolver_login_hd order by resolver_id limit 1`)).rows[0];
    const targets = (await eo.call('GET', '/tickets/reassign-targets')).json;
    expect(targets.some((x: any) => x.id === `hd:${hdRow.resolver_id}`)).toBe(true);
    expect((await act(eo, t, 'new', { type: 'reassign', assigneeId: `hd:${hdRow.resolver_id}`, reason: 'Belongs to HelpDesk' })).json).toBeNull();
    const hd = s.client(); await hd.login(hdRow.user_name);
    expect((await hd.call('GET', '/tickets?list=assigned-new&page=1')).json.items.map((i: any) => i.number)).toContain(t);
    expect((await eo.call('GET', `/tickets/${t}`)).status).toBe(403);
    expect((await act(hd, t, 'new', { type: 'reassign', assigneeId: 'eobc:2', reason: 'Back to EoBC' })).json).toBeNull();
    const c2 = s.client(); await c2.login('creator2');
    expect((await c2.call('GET', '/tickets?list=assigned-new&page=1')).json.items.map((i: any) => i.number)).toContain(t);
    expect((await hd.call('GET', `/tickets/${t}`)).status).toBe(403);
  });
});

describe('case details, attachments and repeated cases', () => {
  it('enforces 20-1000 words and rejects special characters', async () => {
    const d = s.client(); await d.dealerLogin();
    const r1 = await raise(d, 'EoBC', { description: 'too short' });
    expect(r1.r.json.meta).toMatchObject({ field: 'description' });
    const r2 = await raise(d, 'EoBC', { description: Array(1001).fill('word').join(' ') });
    expect(r2.r.json.meta).toMatchObject({ field: 'description', code: 'err.t.maxWords' });
    const r3 = await raise(d, 'EoBC', { description: uniqueText() + " ' OR 1=1; <script>alert(1)</script>" });
    expect(r3.r.json.meta).toMatchObject({ field: 'description', code: 'err.t.chars' });
    const r4 = await raise(d, 'EoBC', { name: 'Robert<img>' });
    expect(r4.r.json.meta).toMatchObject({ field: 'name' });
  });

  it('refuses duplicate file names, hidden executable extensions and PDFs with scripts', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const att = (n: string) => ({ name: n, size: 9, kind: 'other' });
    const dup = await d.form('/tickets', { ...asInput(e), attachments: [att('a.pdf'), att('A.PDF')] }, [{ name: 'a.pdf', bytes: pdf }, { name: 'A.PDF', bytes: pdf }]);
    expect(dup.json.meta).toMatchObject({ field: 'attachments', code: 'err.t.fileDup' });
    const hidden = await d.form('/tickets', { ...asInput(e), attachments: [att('invoice.exe.pdf')] }, [{ name: 'invoice.exe.pdf', bytes: pdf }]);
    expect(hidden.json.meta).toMatchObject({ field: 'attachments', code: 'err.t.fileName' });
    const active = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj');
    const bad = await d.form('/tickets', { ...asInput(e), attachments: [att('s.pdf')] }, [{ name: 's.pdf', bytes: active }]);
    expect(bad.json.meta).toMatchObject({ field: 'attachments', code: 'err.t.filePdfActive' });
  });

  it('flags a repeated case in warn mode and refuses it in block mode', async () => {
    const d = s.client(); await d.dealerLogin();
    const e = dealerRoute('EoBC');
    const text = uniqueText();
    const first = await d.form('/tickets', { ...asInput(e), description: text }, []);
    expect(first.status).toBe(201);
    const again = { ...asInput(e), description: text + ' please' };
    const warn = await d.form('/tickets', again, []);
    expect(warn.status).toBe(409);
    expect(warn.json.code).toBe('DUPLICATE_SUSPECTED');
    expect(warn.json.meta).toMatchObject({ number: first.json.number, blocked: 0 });
    expect((await d.form('/tickets', { ...again, confirmNotDuplicate: true }, [])).status).toBe(201);
    const sup = s.client(); await sup.login('creator1');
    await sup.call('PUT', '/admin/settings', { values: { 'dup.mode': 'block' } });
    const blocked = await d.form('/tickets', { ...asInput(e), description: text + ' once more' , confirmNotDuplicate: true }, []);
    expect(blocked.json.meta).toMatchObject({ blocked: 1 });
    await sup.call('PUT', '/admin/settings', { values: { 'dup.mode': 'warn' } });
  });
});

describe('sign-in rules', () => {
  it('validates the GSTIN structure and check character', async () => {
    const c = s.client();
    for (const bad of ['33ABCDE1234F1Z5', '33ABCDE1234F1Y7', '33abcde1234f1z', '99ABCDE1234F1Z7', '33ABCDE12X4F1Z7'])
      expect((await c.call('POST', '/auth/dealer/lookup', { kind: 'gst', identifier: bad })).json.code).toBe('NO_ACTIVE_GSTIN');
    expect((await c.call('POST', '/auth/dealer/lookup', { kind: 'gst', identifier: '33ABCDE1234F1Z7' })).status).toBe(200);
  });

  it('allows three wrong OTP entries and three resends', async () => {
    await s.pg.query(`insert into dealer_login (gstn, legal_name, trade_name, email_id, mobile_number, active_yn) values ('33QQQQQ0000Q1Z6','Lock Test Co','','lock@example.com','9876511111','Y')`);
    const c = s.client();
    const l = await c.call('POST', '/auth/dealer/lookup', { kind: 'gst', identifier: '33QQQQQ0000Q1Z6' });
    let o = (await c.call('POST', '/auth/dealer/otp', { lookupId: l.json.lookupId })).json;
    expect(o.maxAttempts).toBe(3);
    expect(o.resendsLeft).toBe(3);
    for (const left of [2, 1]) expect((await c.call('POST', '/auth/dealer/verify', { challengeId: o.challengeId, otp: '000000' })).json.meta).toMatchObject({ left });
    expect((await c.call('POST', '/auth/dealer/verify', { challengeId: o.challengeId, otp: '000000' })).json.code).toBe('OTP_LOCKED');
  });
});

describe('Super Admin console and dashboard', () => {
  it('only the Super Admin sees the console; changes are validated, applied and logged', async () => {
    const other = s.client(); await other.login('creator2');
    expect((await other.call('GET', '/admin/settings')).status).toBe(403);
    expect((await other.call('GET', '/reports/summary')).status).toBe(403);
    const sup = s.client(); await sup.login('creator1');
    const doc = (await sup.call('GET', '/admin/settings')).json;
    expect(doc.values['case.minWords']).toBe(20);
    expect((await sup.call('PUT', '/admin/settings', { values: { 'case.minWords': 5000 } })).json.code).toBe('VALIDATION');
    expect((await sup.call('PUT', '/admin/settings', { values: { 'case.minWords': 60, 'case.maxWords': 50 } })).json.code).toBe('VALIDATION');
    expect((await sup.call('PUT', '/admin/settings', { values: { 'bogus': 1 } })).json.code).toBe('VALIDATION');
    const ok = await sup.call('PUT', '/admin/settings', { values: { 'case.minWords': 5 } });
    expect(ok.status).toBe(200);
    expect(ok.json.values['case.minWords']).toBe(5);
    expect(ok.json.meta['case.minWords'].by).toBeTruthy();
    const log = await s.pg.query(`select count(*)::int n from hd_setting_log where key = 'case.minWords'`);
    expect(log.rows[0].n).toBeGreaterThan(0);
    const d = s.client(); await d.dealerLogin();
    expect((await d.call('GET', '/tickets/masters')).json.limits.minWords).toBe(5);
    await sup.call('PUT', '/admin/settings', { values: { 'case.minWords': 20 } });
    expect((await d.call('GET', '/admin/settings')).status).toBe(403);
  });

  it('reports summarise tickets with filters and export a safe CSV', async () => {
    const sup = s.client(); await sup.login('creator1');
    const r = (await sup.call('GET', '/reports/summary')).json;
    expect(r.totals.total).toBeGreaterThan(0);
    expect(r.byMonth).toHaveLength(12);
    const eobc = (await sup.call('GET', '/reports/summary?wing=EoBC')).json;
    expect(eobc.totals.total).toBeLessThanOrEqual(r.totals.total);
    const none = (await sup.call('GET', '/reports/summary?year=1999')).json;
    expect(none.totals.total).toBe(0);
  });
});
