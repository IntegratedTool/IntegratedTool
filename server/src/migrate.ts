import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, serverRoot } from './config.js';
import { connect } from './db.js';
import { askLine } from './askPassword.js';

/** Creates the portal's own ticket tables (hd_*). Existing tables are not touched. Safe to run more than once. */
async function main() {
  const c = loadConfig();
  const dir = path.join(serverRoot, 'sql');
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  console.log('This will create or update the portal\'s own tables (hd_ticket, hd_ticket_event, hd_ticket_attachment, hd_setting, hd_setting_log, two number sequences).');
  console.log(`Scripts: ${files.join(', ')}`);
  console.log(`in database "${c.database}", schema "${c.schema}". Nothing existing is changed or removed.`);
  const db = await connect(c);
  try {
    if ((await askLine('Type YES to continue: ')).trim() !== 'YES') return console.log('Cancelled. Nothing was changed.');
    await db.tx(async (q) => {
      await q.query(`set local search_path to "${c.schema}"`);
      for (const f of files) await q.query(readFileSync(path.join(dir, f), 'utf8'));
    });
    console.log('Done. The ticket tables are ready.');
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
});
