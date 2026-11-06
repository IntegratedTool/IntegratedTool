import type { Db, Queryable } from './dbAdapter.js';
import { ApiError } from '../../src/services/types.js';
import type { SettingsDoc } from '../../src/services/adminTypes.js';
import { SETTINGS, cleanSetting, defaultSettings, settingsConflict, type Settings } from '../../src/utils/settingsSchema.js';

const TTL_MS = 30_000;

/** Super Admin settings: built-in defaults overlaid with the values stored in hd_setting. */
export class SettingsService {
  private cache: Settings | null = null;
  private loadedAt = 0;
  private warned = false;
  constructor(private db: Db) {}

  async current(): Promise<Settings> {
    if (this.cache && Date.now() - this.loadedAt < TTL_MS) return this.cache;
    const out = defaultSettings();
    try {
      const r = await this.db.query<{ key: string; value: string }>('select key, value from hd_setting');
      for (const row of r.rows) {
        const def = SETTINGS.find((d) => d.key === row.key);
        if (!def) continue;
        let raw: unknown;
        try { raw = JSON.parse(row.value); } catch { continue; }
        const v = cleanSetting(def, raw);
        if (v !== null) out[row.key] = v; // an invalid stored value is ignored: the default stays in force
      }
    } catch (e) {
      if (!this.warned) { console.warn('Settings table not available (run "npm run db:migrate"); using built-in defaults.', (e as Error).message); this.warned = true; }
    }
    this.cache = out;
    this.loadedAt = Date.now();
    return out;
  }

  async doc(): Promise<SettingsDoc> {
    const values = await this.current();
    const meta: SettingsDoc['meta'] = {};
    try {
      const r = await this.db.query<{ key: string; updated_by: string | null; updated_at: Date | string }>('select key, updated_by, updated_at from hd_setting');
      for (const x of r.rows) meta[x.key] = { by: x.updated_by ?? '', at: new Date(x.updated_at).toISOString() };
    } catch { /* table missing: no history */ }
    return { values, meta };
  }

  /** Validates the whole submitted set (every key must be known, every value acceptable) and stores only the changes. */
  async save(input: unknown, who: string): Promise<SettingsDoc> {
    if (!input || typeof input !== 'object') throw new ApiError('VALIDATION', { field: 'values' });
    const before = await this.current();
    const next: Settings = { ...before };
    for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
      const def = SETTINGS.find((d) => d.key === k);
      if (!def) throw new ApiError('VALIDATION', { field: k });
      const v = cleanSetting(def, raw);
      if (v === null) throw new ApiError('VALIDATION', { field: k });
      next[k] = v;
    }
    const conflict = settingsConflict(next);
    if (conflict) throw new ApiError('VALIDATION', { field: 'conflict', message: conflict });
    await this.db.tx(async (q: Queryable) => {
      for (const def of SETTINGS) {
        if (next[def.key] === before[def.key]) continue;
        const json = JSON.stringify(next[def.key]);
        await q.query(
          `insert into hd_setting (key, value, updated_by) values ($1,$2,$3)
           on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
          [def.key, json, who]);
        await q.query(`insert into hd_setting_log (key, old_value, new_value, changed_by) values ($1,$2,$3,$4)`, [def.key, JSON.stringify(before[def.key]), json, who]);
      }
    });
    this.cache = null;
    return this.doc();
  }
}
