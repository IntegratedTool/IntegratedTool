import type { DbConfig } from '../config.js';
import type { Queryable } from '../dbAdapter.js';

/** An account that can sign in as Admin and/or be a ticket assignee. */
export interface Resolver {
  /** eobc:<id> or hd:<resolver_id> */
  ref: string;
  source: 'eobc' | 'hd';
  username: string;
  name: string;
  email: string | null;
  mobile: string | null;
  passwordHash: string | null;
}

interface Row {
  id: number | string;
  username: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  pw: string | null;
}
const toResolver = (source: 'eobc' | 'hd', r: Row): Resolver => ({
  ref: `${source}:${r.id}`,
  source,
  username: String(r.username ?? '').trim(),
  name: (r.name ?? r.username ?? '').trim(),
  email: r.email?.trim() || null,
  mobile: r.mobile == null ? null : String(r.mobile).trim(),
  passwordHash: r.pw,
});

const T = (c: DbConfig, name: string) => `"${c.schema}"."${name}"`;
const EOBC_COLS = (c: DbConfig) => `id, adminusername as username, adminname as name, emailid as email, mobile_no::text as mobile, password as pw from ${T(c, c.tables.resolverEobc)}`;
const HD_COLS = (c: DbConfig) => `resolver_id as id, user_name as username, name, email_id as email, mobile_number as mobile, password as pw from ${T(c, c.tables.resolverHd)}`;
const EOBC_ACTIVE = `upper(btrim(active_yn)) in ('Y','YES','1','TRUE','ACTIVE')`;
const HD_ACTIVE = `upper(btrim(active_yn)) = 'Y'`;

/** Active accounts whose user name or email equals the typed identifier (case-insensitive). */
export async function findLoginCandidates(q: Queryable, c: DbConfig, identifier: string): Promise<Resolver[]> {
  const id = identifier.trim().toLowerCase();
  if (!id) return [];
  const e = await q.query<Row>(
    `select ${EOBC_COLS(c)} where ${EOBC_ACTIVE} and (lower(btrim(adminusername)) = $1 or lower(btrim(emailid)) = $1) order by id`,
    [id],
  );
  const h = await q.query<Row>(
    `select ${HD_COLS(c)} where ${HD_ACTIVE} and (lower(btrim(user_name)) = $1 or lower(btrim(email_id)) = $1) order by resolver_id`,
    [id],
  );
  return [...e.rows.map((r) => toResolver('eobc', r)), ...h.rows.map((r) => toResolver('hd', r))];
}

/** Active assignee for a routing value (assign_to) in the wing's resolver table. Exactly one match, or null. */
export async function findAssignee(q: Queryable, c: DbConfig, wing: string, assignTo: string): Promise<Resolver | null> {
  const which = c.wingTables[wing.trim().toLowerCase()];
  const v = assignTo.trim().toLowerCase();
  if (!which || !v) return null;
  const r =
    which === 'eobc'
      ? await q.query<Row>(`select ${EOBC_COLS(c)} where ${EOBC_ACTIVE} and lower(btrim(adminusername)) = $1`, [v])
      : await q.query<Row>(`select ${HD_COLS(c)} where ${HD_ACTIVE} and lower(btrim(user_name)) = $1`, [v]);
  return r.rows.length === 1 ? toResolver(which, r.rows[0]) : null;
}

/** All active resolvers (for reassignment). */
export async function listResolvers(q: Queryable, c: DbConfig): Promise<Resolver[]> {
  const e = await q.query<Row>(`select ${EOBC_COLS(c)} where ${EOBC_ACTIVE} order by adminname`);
  const h = await q.query<Row>(`select ${HD_COLS(c)} where ${HD_ACTIVE} order by name`);
  return [...e.rows.map((r) => toResolver('eobc', r)), ...h.rows.map((r) => toResolver('hd', r))];
}

export async function getResolver(q: Queryable, c: DbConfig, ref: string): Promise<Resolver | null> {
  const [src, id] = ref.split(':');
  if (!/^\d+$/.test(id ?? '')) return null;
  if (src === 'eobc') {
    const r = await q.query<Row>(`select ${EOBC_COLS(c)} where ${EOBC_ACTIVE} and id = $1`, [Number(id)]);
    return r.rows[0] ? toResolver('eobc', r.rows[0]) : null;
  }
  if (src === 'hd') {
    const r = await q.query<Row>(`select ${HD_COLS(c)} where ${HD_ACTIVE} and resolver_id = $1`, [Number(id)]);
    return r.rows[0] ? toResolver('hd', r.rows[0]) : null;
  }
  return null;
}

export interface Dealer {
  id: number;
  gstin: string;
  legalName: string;
  tradeName: string | null;
  email: string | null;
  mobile: string | null;
  active: boolean;
}

export async function findDealerByGstin(q: Queryable, c: DbConfig, gstin: string): Promise<Dealer | null> {
  const r = await q.query<{ dealer_id: number; gstn: string; legal_name: string; trade_name: string | null; email_id: string | null; mobile_number: string | null; active_yn: string | null }>(
    `select dealer_id, gstn, legal_name, trade_name, email_id, mobile_number, active_yn from ${T(c, c.tables.dealer)} where upper(btrim(gstn)) = $1 order by dealer_id limit 1`,
    [gstin.toUpperCase()],
  );
  const d = r.rows[0];
  if (!d) return null;
  return {
    id: d.dealer_id,
    gstin: d.gstn.trim(),
    legalName: d.legal_name.trim(),
    tradeName: d.trade_name?.trim() || null,
    email: d.email_id?.trim() || null,
    mobile: d.mobile_number?.trim() || null,
    active: (d.active_yn ?? '').trim().toUpperCase() === 'Y',
  };
}

export async function getDealer(q: Queryable, c: DbConfig, id: number): Promise<Dealer | null> {
  const r = await q.query<{ gstn: string }>(`select gstn from ${T(c, c.tables.dealer)} where dealer_id = $1`, [id]);
  return r.rows[0] ? findDealerByGstin(q, c, r.rows[0].gstn) : null;
}
