import type { Queryable } from './dbAdapter.js';
import type { DbConfig } from './config.js';
import { loadConfig } from './config.js';
import { connect } from './db.js';
import { askLine, askPassword } from './askPassword.js';
import { detectAlgo, matchingAlgos } from './security/password.js';
import { findLoginCandidates } from './repo/people.js';
import { activeRoutes } from './repo/routing.js';
import { findAssignee } from './repo/people.js';

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function overview(q: Queryable, c: DbConfig, extra: string[]) {
  const v = await q.query('select version() as v, current_user as u, current_database() as d');
  console.log(`\nConnected as ${v.rows[0].u} to ${v.rows[0].d}`);
  console.log(v.rows[0].v);
  const t = await q.query(`select table_name from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE' order by table_name`, [c.schema]);
  console.log(`\nTables visible in schema "${c.schema}" (${t.rowCount}):`);
  for (const r of t.rows) console.log('  -', r.table_name);
  const wanted = extra.length ? extra : Object.values(c.tables);
  for (const name of wanted) {
    if (!ID.test(name)) { console.log(`\nSkipping invalid table name "${name}".`); continue; }
    const cols = await q.query(
      `select column_name, data_type, character_maximum_length as len, is_nullable from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`,
      [c.schema, name]);
    console.log(`\nColumns of ${c.schema}.${name} (${cols.rowCount}):`);
    for (const r of cols.rows) console.log(`  ${r.column_name.padEnd(20)} ${r.data_type}${r.len ? `(${r.len})` : ''}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
  }
}

/** Tells which hashing method produced the stored password. Hashes and passwords are never printed. */
async function hashTest(q: Queryable, c: DbConfig) {
  const user = (await askLine('\nAdmin user name or email to test: ')).trim();
  const found = await findLoginCandidates(q, c, user);
  if (!found.length) return console.log('No ACTIVE account with that user name / email in either resolver table.');
  const pw = await askPassword('Password of that account (not shown, not saved): ');
  for (const r of found) {
    const stored = (r.passwordHash ?? '').trim();
    const shape = detectAlgo(stored);
    const hits = await matchingAlgos(stored, pw);
    console.log(`\n${r.source === 'eobc' ? c.tables.resolverEobc : c.tables.resolverHd} (${r.ref}): stored value is ${stored.length} characters, looks like ${shape}.`);
    console.log(hits.length ? `  MATCH: the password is stored as ${hits.join(' / ')}. Set "auth.passwordHash" to "${hits[0]}" (or leave "auto").` : '  No match with md5 / sha1 / sha256 / sha512 / bcrypt.');
    if (!hits.length) console.log('  Possible reasons: wrong password typed, a salt or pepper is added by the old application, or the value is reversible encryption. Tell me what the old application used.');
  }
}

/** Shows routing rows whose assign_to does not match exactly one active resolver in the wing's table. Counts and names of rules only. */
async function routingCheck(q: Queryable, c: DbConfig) {
  const routes = await activeRoutes(q, c, null);
  const bad = new Map<string, number>();
  let ok = 0;
  for (const r of routes) {
    const a = await findAssignee(q, c, r.wing, r.assignTo);
    if (a) ok += 1;
    else bad.set(`${r.wing} / ${r.assignTo}`, (bad.get(`${r.wing} / ${r.assignTo}`) ?? 0) + 1);
  }
  console.log(`\nActive routing rows: ${routes.length}. With a matching active assignee: ${ok}. Without: ${routes.length - ok}.`);
  for (const [k, n] of bad) console.log(`  no match for  ${k}   (${n} routing rows)`);
  if (!bad.size) console.log('  Every assign_to value resolves to exactly one active account.');
  else console.log('Tickets for these combinations will be refused (nothing created) until the data is corrected.');
}

async function main() {
  const args = process.argv.slice(2);
  const c = loadConfig();
  const db = await connect(c);
  try {
    if (args.includes('--hash-test')) await hashTest(db, c);
    else if (args.includes('--routing')) await routingCheck(db, c);
    else await overview(db, c, args.filter((a) => !a.startsWith('--')));
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
});
