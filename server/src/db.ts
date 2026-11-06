import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { DbConfig } from './config.js';
import { askPassword } from './askPassword.js';
import { pgDb, type Db } from './dbAdapter.js';

function sslOption(c: DbConfig): pg.PoolConfig['ssl'] {
  const { mode, caFile } = c.ssl;
  if (mode === 'disable') return false;
  if (mode === 'prefer') return { rejectUnauthorized: false }; // try SSL; connect() falls back to plain if the server has none
  const ca = caFile ? readFileSync(caFile, 'utf8') : undefined;
  // verify-ca: certificate chain is checked but the host name is not (useful when connecting by IP address).
  const verify = mode === 'verify-full' || mode === 'verify-ca';
  return {
    rejectUnauthorized: verify,
    ...(mode === 'verify-ca' ? { checkServerIdentity: () => undefined } : {}),
    ...(ca ? { ca } : {}),
  };
}

/** Asks for the password, opens a pool and proves the connection works. The password lives only in memory. */
export async function connect(c: DbConfig): Promise<Db> {
  const password = await askPassword(`Password for ${c.user}@${c.host}:${c.port}/${c.database}: `);
  const make = (ssl: pg.PoolConfig['ssl']) =>
    new pg.Pool({
      host: c.host,
      port: c.port,
      database: c.database,
      user: c.user,
      password,
      ssl,
      connectionTimeoutMillis: c.connectionTimeoutMs,
      max: 5,
      application_name: 'ctd-helpdesk-portal',
    });
  let pool = make(sslOption(c));
  try {
    await pool.query('select 1');
  } catch (e) {
    await pool.end().catch(() => undefined);
    // "prefer" behaves like pgAdmin: try SSL first, fall back to an unencrypted connection only if the server has no SSL.
    if (c.ssl.mode === 'prefer' && /does not support SSL/i.test((e as Error).message)) {
      pool = make(false);
      try {
        await pool.query('select 1');
        console.warn('Note: the server does not offer SSL, so this connection is NOT encrypted.');
        return pgDb(pool);
      } catch (e2) {
        await pool.end().catch(() => undefined);
        throw new Error(`Could not connect: ${(e2 as Error).message}`);
      }
    }
    throw new Error(`Could not connect: ${(e as Error).message}`);
  }
  return pgDb(pool);
}
