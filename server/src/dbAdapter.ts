import type pg from 'pg';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}
export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}
/** The only database surface the application code uses, so the same code runs on pg (production) and PGlite (tests). */
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function pgDb(pool: pg.Pool): Db {
  const wrap = (c: pg.Pool | pg.PoolClient): Queryable => ({
    async query(text, params) {
      const r = await c.query(text, params as unknown[]);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
