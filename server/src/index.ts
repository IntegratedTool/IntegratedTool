import { loadConfig } from './config.js';
import { connect } from './db.js';
import { createApp } from './app.js';
import { autoCloseDue } from './repo/tickets.js';
import type { SettingsService } from './settings.js';

/** Starts the portal API. The database password is asked each time; it is never saved. */
async function main() {
  const config = loadConfig();
  const db = await connect(config);
  console.log('Database connection OK.');
  const missing = await db.query(
    `select to_regclass('hd_ticket') as t`,
  );
  if (!missing.rows[0].t) console.warn('\nNote: the ticket tables do not exist yet. Run "npm run db:migrate" once.\n');

  const app = createApp({ db, config });

  // Resolved cases that were not reopened or closed are closed automatically (checked now and every 15 minutes).
  const settings = app.locals.settings as SettingsService;
  const sweep = async () => {
    try {
      const n = await autoCloseDue(db, await settings.current());
      if (n) console.log(`Auto-closed ${n} resolved case(s).`);
    } catch (e) { console.error('Auto-close check failed:', (e as Error).message); }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), 15 * 60_000);
  timer.unref();
  const server = app.listen(config.api.port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${config.api.port}/api/v1`));
  const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
});
