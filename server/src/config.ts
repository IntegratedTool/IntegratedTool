import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  schema: string;
  ssl: { mode: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'; caFile: string | null };
  connectionTimeoutMs: number;
  /** Existing tables the portal reads. Names only; the portal never changes these tables. */
  tables: { resolverEobc: string; resolverHd: string; dealer: string; routing: string };
  /** Accounts that act as Help desk ticket creators (see "ref" format: eobc:<id> or hd:<resolver_id>). */
  ticketCreators: string[];
  /** Super Admin accounts (eobc:<id> or hd:<id>): settings console, dashboard and reports, closing Resolved cases, read access to every case */
  superAdmins: string[];
  /** Routing "wing" value -> which resolver table holds that wing's assignees. */
  wingTables: Record<string, 'eobc' | 'hd'>;
  /** Routing "authenticator" value used for signed-in dealers. */
  dealerAuthenticator: string;
  auth: { passwordHash: 'auto' | 'md5' | 'sha1' | 'sha256' | 'sha512' | 'bcrypt'; sampleOtp: string; sessionMinutes: number; /** sign-in / OTP calls allowed per address in 5 minutes */ maxPer5Min: number };
  uploads: { dir: string; maxFileMB: number };
  api: { port: number; allowedOrigin: string; secureCookie: boolean };
}

export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(serverRoot, 'db.config.json');

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const defaults = {
  tables: { resolverEobc: 'resolver_login_eobc', resolverHd: 'resolver_login_hd', dealer: 'dealer_login', routing: 'issue_routing_master' },
  ticketCreators: ['eobc:1', 'eobc:2'],
  superAdmins: ['eobc:1'],
  wingTables: { eobc: 'eobc', helpdesk: 'hd' } as Record<string, 'eobc' | 'hd'>,
  dealerAuthenticator: 'Dealer',
  auth: { passwordHash: 'auto' as const, sampleOtp: '123456', sessionMinutes: 30, maxPer5Min: 40 },
  uploads: { dir: './uploads', maxFileMB: 5 },
  api: { port: 4000, allowedOrigin: 'http://localhost:5173', secureCookie: false },
};

/** Fills every optional setting with its default and validates the rest. The password is deliberately NOT part of it. */
export function normaliseConfig(c: Partial<DbConfig>): DbConfig {
  const out = {
    ...c,
    schema: c.schema ?? 'public',
    connectionTimeoutMs: c.connectionTimeoutMs ?? 10000,
    port: c.port ?? 5432,
    ssl: { mode: c.ssl?.mode ?? 'prefer', caFile: c.ssl?.caFile ?? null },
    tables: { ...defaults.tables, ...(c.tables ?? {}) },
    ticketCreators: c.ticketCreators ?? defaults.ticketCreators,
    superAdmins: c.superAdmins ?? defaults.superAdmins,
    wingTables: { ...defaults.wingTables, ...(c.wingTables ?? {}) },
    dealerAuthenticator: c.dealerAuthenticator ?? defaults.dealerAuthenticator,
    auth: { ...defaults.auth, ...(c.auth ?? {}) },
    uploads: { ...defaults.uploads, ...(c.uploads ?? {}) },
    api: { ...defaults.api, ...(c.api ?? {}) },
  } as DbConfig;
  if (!ID.test(out.schema)) throw new Error('"schema" must be a plain identifier.');
  for (const k of Object.keys(defaults.tables) as (keyof DbConfig['tables'])[]) {
    if (typeof out.tables[k] !== 'string' || !ID.test(out.tables[k])) throw new Error(`"tables.${k}" must be a plain table name.`);
  }
  return out;
}

/** Reads db.config.json. */
export function loadConfig(): DbConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    throw new Error(`Cannot read ${configPath}. Create it from the template and fill in the server details.`);
  }
  const c = JSON.parse(raw) as DbConfig;
  const missing = (['host', 'database', 'user'] as const).filter((k) => !c[k] || /example|your_/i.test(String(c[k])));
  if (missing.length) throw new Error(`Please fill in ${missing.join(', ')} in server/db.config.json first.`);
  return normaliseConfig(c);
}
