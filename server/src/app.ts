import { createHash, randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { serverRoot, type DbConfig } from './config.js';
import type { Db } from './dbAdapter.js';
import { findDealerByGstin, findLoginCandidates, getDealer } from './repo/people.js';
import * as reports from './repo/reports.js';
import * as tickets from './repo/tickets.js';
import { SettingsService } from './settings.js';
import { captchaSpeech, checkCaptcha, newCaptcha } from './security/captcha.js';
import { consumeOtp, issueOtp, resendOtp, setOtpLimits } from './security/otp.js';
import { verifyPassword } from './security/password.js';
import { SessionStore, type SessionUser } from './security/session.js';
import { maskEmail, normaliseGstin } from '../../src/utils/validation.js';
import { gstinProblem } from '../../src/utils/gstin.js';
import { fileNameProblem } from '../../src/utils/inputPolicy.js';
import { ApiError, type ApiErrorCode, type AuthResult, type Capabilities } from '../../src/services/types.js';
import type { ListKind, NewTicketInput, TicketAction, TicketFilters, TicketStatus } from '../../src/services/ticketTypes.js';

const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, SERVICE_UNAVAILABLE: 503, INVALID_STATE: 409, ROUTING_FAILED: 422, VALIDATION: 400,
  DUPLICATE_SUSPECTED: 409, RATE_LIMITED: 429, OTP_RESEND_LIMIT: 429,
};
const LISTS: ListKind[] = ['mine', 'assigned-new', 'assigned-inprogress', 'assigned-onhold', 'assigned-resolved', 'assigned-closed', 'assigned-reopened', 'helpdesk', 'closure'];
const STATUSES: TicketStatus[] = ['new', 'inprogress', 'onhold', 'resolved', 'closed', 'withdrawn'];

const ADMIN_CAPS = (raise: boolean, sup: boolean): Capabilities => ({
  assignedTickets: true, helpdeskReview: true, mis: true, viewAssignmentHistory: true, reassign: true, sendToHelpdesk: false, raise,
  closeCases: sup, console: sup, dashboard: sup,
});
const DEALER_CAPS: Capabilities = {
  assignedTickets: false, helpdeskReview: false, mis: false, viewAssignmentHistory: false, reassign: false, sendToHelpdesk: false, raise: true,
  closeCases: false, console: false, dashboard: false,
};

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

export interface AppOptions {
  db: Db;
  config: DbConfig;
}

export function createApp({ db, config }: AppOptions) {
  const settings = new SettingsService(db);
  const S = () => settings.current();
  const sessions = new SessionStore(config.auth.sessionMinutes * 60_000, config.api.secureCookie);
  const credFails = new Map<string, number>();
  const lookups = new Map<string, { dealerId: number; email: string }>();
  const uploadsRoot = path.resolve(serverRoot, config.uploads.dir);
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 25 * 1024 * 1024, fields: 5, fieldSize: 400_000 } }); // real limits come from the console settings

  const need = (req: Request): SessionUser => {
    const u = sessions.get(req);
    if (!u) throw new ApiError('UNAUTHENTICATED');
    return u;
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.api.allowedOrigin, credentials: true, allowedHeaders: ['Content-Type', 'X-Requested-With', 'Accept'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // CSRF: state-changing calls must carry the custom header (a cross-site form cannot set it) in addition to SameSite cookies.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'ctd-portal') {
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    next();
  });

  // Simple per-address throttle on sign-in and OTP calls (in memory; behind NGINX use its limiter as well).
  const hits = new Map<string, number[]>();
  const throttle: RequestHandler = (req, _res, next) => {
    const key = `${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 5 * 60_000);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > 5 * 60_000) hits.delete(k);
    if (recent.length > config.auth.maxPer5Min) return next(new ApiError('RATE_LIMITED'));
    next();
  };

  const api = express.Router();
  api.use('/auth', throttle);
  api.use('/auth', (_req, _res, next) => {
    S().then((s) => {
      setOtpLimits({ validity: Number(s['otp.validitySeconds']), resendWait: Number(s['otp.resendWaitSeconds']), maxAttempts: Number(s['otp.maxAttempts']), maxResends: Number(s['otp.maxResends']) });
      next();
    }).catch(next);
  });

  api.get('/health', wrap(async (_req, res) => {
    await db.query('select 1');
    res.json({ status: 'ok' });
  }));

  /* ---------- captcha ---------- */
  api.get('/time', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ now: new Date().toISOString() }); });
  api.get('/captcha', (_req, res) => res.json(newCaptcha()));
  api.get('/captcha/:id/audio', (req, res) => res.json(captchaSpeech(req.params.id)));

  /* ---------- admin login ---------- */
  api.post('/auth/admin/login', wrap(async (req, res) => {
    const identifier = str(req.body?.identifier, 200).trim();
    const password = str(req.body?.password, 200);
    const key = `admin:${identifier.toLowerCase()}`;
    const fails = credFails.get(key) ?? 0;
    if (fails >= 1) checkCaptcha(req.body?.captcha); // a wrong CAPTCHA never counts as a credential failure

    let user: SessionUser | null = null;
    let hasEmail: string | null = null;
    if (identifier && password) {
      for (const r of await findLoginCandidates(db, config, identifier)) {
        if (await verifyPassword(r.passwordHash, password, config.auth.passwordHash)) {
          const creator = true; // every administrator may raise tickets on behalf of callers (phone, e-mail, in-person)
          user = { userId: r.ref, name: r.name, role: 'admin', capabilities: ADMIN_CAPS(creator, config.superAdmins.includes(r.ref)), creator };
          hasEmail = r.email;
          break;
        }
      }
    }
    if (!user) {
      credFails.set(key, fails + 1);
      throw new ApiError('INVALID_CREDENTIALS', { captchaRequired: 1 });
    }
    credFails.delete(key);
    sessions.start(res, user);
    const result: AuthResult = {
      displayName: user.name, userType: 'admin', userId: user.userId, capabilities: user.capabilities,
      prefill: { name: user.name, ...(hasEmail ? { email: hasEmail } : {}) },
    };
    res.json(result);
  }));

  /* ---------- dealer login (sample OTP) ---------- */
  api.post('/auth/dealer/lookup', wrap(async (req, res) => {
    const kind = req.body?.kind;
    const id = normaliseGstin(str(req.body?.identifier, 40));
    if (kind !== 'gst') throw new ApiError('NO_ACTIVE_TIN'); // the dealer table has no TIN column
    const s = await S();
    const allowed = String(s['login.allowedStateCodes']).split(',');
    if (gstinProblem(id, { checksum: Boolean(s['login.gstinChecksum']) }) || !allowed.includes(id.slice(0, 2))) throw new ApiError('NO_ACTIVE_GSTIN');
    const d = await findDealerByGstin(db, config, id);
    if (!d || !d.active) throw new ApiError('NO_ACTIVE_GSTIN');
    if (!d.email) throw new ApiError('NO_REGISTERED_EMAIL');
    const lookupId = `lk-${randomBytes(9).toString('hex')}`;
    lookups.set(lookupId, { dealerId: d.id, email: d.email });
    res.json({ lookupId, maskedEmail: maskEmail(d.email) });
  }));
  api.post('/auth/dealer/otp', wrap(async (req, res) => {
    const lk = lookups.get(str(req.body?.lookupId, 60));
    if (!lk) throw new ApiError('OTP_EXPIRED');
    res.json(issueOtp('dealer', `dealer:${lk.dealerId}`, lk.email, lk.dealerId));
  }));
  api.post('/auth/dealer/verify', wrap(async (req, res) => {
    const { payload } = consumeOtp(str(req.body?.challengeId, 60), str(req.body?.otp, 12), 'dealer', config.auth.sampleOtp);
    const d = await getDealer(db, config, Number(payload));
    if (!d || !d.active) throw new ApiError('NO_ACTIVE_GSTIN');
    const name = d.tradeName || d.legalName;
    const user: SessionUser = { userId: `dealer:${d.id}`, name, role: 'dealer', capabilities: DEALER_CAPS, creator: false, authenticator: config.dealerAuthenticator };
    sessions.start(res, user);
    const result: AuthResult = {
      displayName: name, userType: 'dealer', userId: user.userId, capabilities: user.capabilities,
      prefill: { name: d.legalName, ...(d.email ? { email: d.email } : {}), ...(d.mobile && /^[0-9]{10}$/.test(d.mobile) ? { mobile: d.mobile } : {}) },
    };
    res.json(result);
  }));
  api.post('/auth/otp/resend', wrap(async (req, res) => { res.json(resendOtp(str(req.body?.challengeId, 60))); }));
  api.post('/auth/logout', (req, res) => { sessions.end(req, res); res.status(204).end(); });

  // Not available with the department's current tables.
  for (const p of ['/auth/officer/login', '/auth/registered/login', '/auth/officer/unblock/otp', '/auth/officer/unblock/verify',
    '/auth/register/otp', '/auth/register/verify', '/auth/reset/otp', '/auth/reset/verify', '/auth/reset/password']) {
    api.post(p, () => { throw new ApiError('SERVICE_UNAVAILABLE'); });
  }

  api.get('/public/districts', (_req, res) => res.json([]));
  api.get('/public/announcements', (_req, res) => res.json([]));

  /* ---------- tickets ---------- */
  api.get('/tickets/masters', wrap(async (req, res) => { res.json(await tickets.mastersFor(db, config, need(req), await S())); }));

  api.post('/tickets', (req, res, next) => upload.array('attachments', 5)(req, res, (err) => {
    if (err) return next(new ApiError('VALIDATION', { field: 'attachments', code: 'err.t.fileSize' }));
    next();
  }), wrap(async (req, res) => {
    const u = need(req);
    const set = await S();
    let input: NewTicketInput;
    try { input = JSON.parse(str(req.body?.data, 400_000)) as NewTicketInput; } catch { throw new ApiError('VALIDATION', { field: 'data' }); }
    if (!input || typeof input !== 'object') throw new ApiError('VALIDATION', { field: 'data' });
    const sent = (input.attachments ?? []) as { kind?: string }[];
    const uploaded = (req.files ?? []) as Express.Multer.File[];
    if (uploaded.length > Number(set['file.maxFiles']) || sent.length !== uploaded.length) throw new ApiError('VALIDATION', { field: 'attachments', code: 'err.t.fileCount' });

    const written: string[] = [];
    try {
      const files: tickets.StoredFile[] = [];
      for (const [i, f] of uploaded.entries()) {
        const b = f.buffer;
        const isPdf = b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF';
        const isJpg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
        const shownName = path.basename(Buffer.from(f.originalname, 'latin1').toString('utf8'));
        const ext = path.extname(shownName).slice(1).toLowerCase();
        const bad = (code: string): never => { throw new ApiError('VALIDATION', { field: 'attachments', code }); };
        if (fileNameProblem(shownName)) bad('err.t.fileName');
        if (!((ext === 'pdf' && isPdf) || ((ext === 'jpg' || ext === 'jpeg') && isJpg))) bad('err.t.fileType'); // renamed / disguised files are rejected
        if (b.length === 0 || b.length > Number(set['file.maxFileMB']) * 1024 * 1024) bad('err.t.fileSize');
        if (isPdf && set['file.blockActivePdf'] && /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/.test(b.toString('latin1'))) bad('err.t.filePdfActive');
        files.push({
          originalName: shownName,
          size: b.length,
          kind: sent[i]?.kind === 'proof' ? 'proof' : 'other',
          contentType: isPdf ? 'application/pdf' : 'image/jpeg',
          sha256: createHash('sha256').update(b).digest('hex'),
          save: async (refNo, slot) => {
            const dir = path.join(uploadsRoot, String(new Date().getFullYear()));
            await mkdir(dir, { recursive: true });
            const target = path.join(dir, `${refNo}-${slot}.${isPdf ? 'pdf' : 'jpg'}`); // server-chosen name: the user's file name is never used on disk
            await writeFile(target, b, { flag: 'wx' });
            written.push(target);
            return target;
          },
        });
      }
      res.status(201).json(await tickets.createTicket(db, config, u, input, files, set));
    } catch (e) {
      await Promise.all(written.map((p) => unlink(p).catch(() => undefined))); // nothing is left behind when the ticket is not created
      throw e;
    }
  }));

  const filtersFrom = (q: Request['query']): TicketFilters => {
    const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string).slice(0, 100) : '');
    const status = s('status');
    const ot = s('originalTransferred');
    return {
      number: s('number'), nature: s('nature'), category: s('category'), assignee: s('assignee'),
      status: (STATUSES as string[]).includes(status) ? (status as TicketStatus) : '',
      reopenedOnly: s('reopenedOnly') === 'true',
      originalTransferred: ot === 'original' || ot === 'transferred' ? ot : '',
    };
  };
  const listOf = (q: Request['query']): ListKind => {
    if (!(LISTS as string[]).includes(String(q.list))) throw new ApiError('VALIDATION', { field: 'list' });
    return q.list as ListKind;
  };

  api.get('/tickets', wrap(async (req, res) => {
    res.json(await tickets.listTickets(db, need(req), listOf(req.query), filtersFrom(req.query), Number(req.query.page) || 1));
  }));
  api.get('/tickets/filter-options', wrap(async (req, res) => { res.json(await tickets.filterOptions(db, need(req), listOf(req.query))); }));
  api.get('/tickets/reassign-targets', wrap(async (req, res) => { res.json(await tickets.reassignTargets(db, config, need(req))); }));
  api.get('/tickets/:number', wrap(async (req, res) => { res.json(await tickets.getTicket(db, need(req), req.params.number, await S())); }));
  api.post('/tickets/:number/actions', wrap(async (req, res) => {
    const u = need(req);
    const expected = req.body?.expectedStatus as TicketStatus;
    const a = req.body?.action as TicketAction;
    if (!(STATUSES as string[]).includes(expected) || !a || typeof a.type !== 'string') throw new ApiError('VALIDATION', { field: 'action' });
    res.json(await tickets.act(db, config, u, req.params.number, expected, a, await S()));
  }));

  /* ---------- Super Admin: console and reports ---------- */
  const needSuper = (req: Request, cap: 'console' | 'dashboard'): SessionUser => {
    const u = need(req);
    if (!u.capabilities[cap]) throw new ApiError('FORBIDDEN');
    return u;
  };
  api.get('/admin/settings', wrap(async (req, res) => { needSuper(req, 'console'); res.json(await settings.doc()); }));
  api.put('/admin/settings', wrap(async (req, res) => {
    const u = needSuper(req, 'console');
    res.json(await settings.save(req.body?.values, `${u.name} (${u.userId})`));
  }));
  api.get('/reports/summary', wrap(async (req, res) => { needSuper(req, 'dashboard'); res.json(await reports.summaryReport(db, reports.cleanFilters(req.query))); }));
  api.get('/reports/export.csv', wrap(async (req, res) => {
    needSuper(req, 'dashboard');
    const csv = await reports.casesCsv(db, reports.cleanFilters(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cases-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }));

  app.locals.settings = settings;
  app.use('/api/v1', api);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(STATUS[err.code] ?? 400).json({ code: err.code, meta: err.meta });
      return;
    }
    console.error(err); // details stay in the server log; the browser only gets a generic code
    res.status(500).json({ code: 'UNKNOWN' satisfies ApiErrorCode });
  });
  return app;
}
