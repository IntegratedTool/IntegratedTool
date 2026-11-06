import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { normaliseConfig, serverRoot, type DbConfig } from '../src/config.js';
import type { Db } from '../src/dbAdapter.js';
import { sampleRoutes } from '../../src/services/sampleRoutes.js';

export const md5 = (s: string) => createHash('md5').update(s).digest('hex');
export const PW = 'Pass@123';

export function pgliteDb(pg: PGlite): Db {
  const wrap = (c: PGlite | { query: PGlite['query'] }) => ({
    async query(text: string, params?: unknown[]) {
      const r = await (c as PGlite).query(text, params as unknown[]);
      return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
    },
  });
  return { ...wrap(pg), tx: (fn) => pg.transaction((t) => fn(wrap(t as never))), close: () => pg.close() };
}

const esc = (s: string) => s.replace(/'/g, "''");

export async function buildDb() {
  const pg = new PGlite();
  await pg.exec(`
    create table resolver_login_eobc (id serial primary key, adminname varchar, adminusername varchar, mobile_no bigint, emailid varchar, password varchar(120), usertype int, active_yn varchar(10));
    create table resolver_login_hd (resolver_id serial primary key, name varchar, user_name varchar, email_id varchar, mobile_number varchar, active_yn char(1), password varchar(200));
    create table dealer_login (dealer_id serial primary key, gstn varchar, legal_name varchar, trade_name varchar, email_id varchar, mobile_number varchar, active_yn char(1));
    create table issue_routing_master (id serial primary key, authenticator varchar, wing varchar, nature_of_issue varchar, issue_category varchar, sub_category varchar, assign_to varchar, active_yn char(1));
  `);
  // ids 1 and 2 are the ticket creators
  await pg.exec(`insert into resolver_login_eobc (adminname, adminusername, emailid, password, active_yn) values
    ('Creator One','creator1','creator1@tn.gov.in','${md5(PW)}','Y'),
    ('Creator Two','creator2','creator2@tn.gov.in','${md5(PW)}','Y'),
    ('Inactive Person','inactive1','inactive@tn.gov.in','${md5(PW)}','N')`);
  const eobc = [...new Set(sampleRoutes.filter((r) => r[1] === 'EoBC').map((r) => r[5]))];
  const hd = [...new Set(sampleRoutes.filter((r) => r[1] === 'HelpDesk').map((r) => r[5]))];
  for (const u of eobc) await pg.exec(`insert into resolver_login_eobc (adminname, adminusername, emailid, password, active_yn) values ('${esc(u)} name','${esc(u)}','${esc(u).replace(/\W/g, '')}@tn.gov.in','${md5(PW)}','Y')`);
  for (const u of hd) await pg.exec(`insert into resolver_login_hd (name, user_name, email_id, password, active_yn) values ('${esc(u)} name','${esc(u)}','hd${esc(u).replace(/\W/g, '')}@tn.gov.in','${md5(PW)}','Y')`);
  await pg.exec(`insert into dealer_login (gstn, legal_name, trade_name, email_id, mobile_number, active_yn) values
    ('33ABCDE1234F1Z7','Demo Traders Pvt Ltd','Demo Traders','dealer@example.com','9876543210','Y'),
    ('33ZZZZZ9999Z1ZF','Dormant Co','', 'x@example.com','9876500000','N')`);
  for (const r of sampleRoutes) {
    await pg.query(`insert into issue_routing_master (authenticator, wing, nature_of_issue, issue_category, sub_category, assign_to, active_yn) values ($1,$2,$3,$4,$5,$6,'Y')`, [r[0], r[1], r[2], r[3], r[4], r[5]]);
  }
  const dir = path.join(serverRoot, 'sql');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(dir, f), 'utf8'));
  return pg;
}

export interface Client {
  call(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }>;
  form(url: string, data: unknown, files: { name: string; bytes: Uint8Array }[]): Promise<{ status: number; json: any }>;
  login(identifier: string, password?: string): Promise<{ status: number; json: any }>;
  dealerLogin(gstin?: string): Promise<{ status: number; json: any }>;
}

export async function startServer(overrides: Partial<DbConfig> = {}) {
  const pg = await buildDb();
  const uploads = mkdtempSync(path.join(os.tmpdir(), 'hd-up-'));
  const config = normaliseConfig({ host: 'x', database: 'x', user: 'x', uploads: { dir: uploads, maxFileMB: 5 }, auth: { maxPer5Min: 100000 }, ...overrides });
  const app = createApp({ db: pgliteDb(pg), config });
  const server: Server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  const client = (): Client => {
    let cookie = '';
    const send = async (method: string, url: string, init: RequestInit) => {
      const r = await fetch(base + url, { ...init, method, headers: { 'X-Requested-With': 'ctd-portal', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) } });
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await r.text();
      return { status: r.status, json: text ? JSON.parse(text) : null };
    };
    const c: Client = {
      call: (m, u, b) => send(m, u, b === undefined ? {} : { body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } }),
      form: (u, data, files) => {
        const f = new FormData();
        f.append('data', JSON.stringify(data));
        files.forEach((x) => f.append('attachments', new Blob([x.bytes]), x.name));
        return send('POST', u, { body: f });
      },
      login: (id, pw = PW) => c.call('POST', '/auth/admin/login', { identifier: id, password: pw }),
      dealerLogin: async (gstin = '33ABCDE1234F1Z7') => {
        const l = await c.call('POST', '/auth/dealer/lookup', { kind: 'gst', identifier: gstin });
        if (l.status !== 200) return l;
        const o = await c.call('POST', '/auth/dealer/otp', { lookupId: l.json.lookupId });
        return c.call('POST', '/auth/dealer/verify', { challengeId: o.json.challengeId, otp: config.auth.sampleOtp });
      },
    };
    return c;
  };
  return { client, uploads, config, pg, close: async () => { await new Promise((r) => server.close(r)); await pg.close(); } };
}
