import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Capabilities } from '../../../src/services/types.js';

export interface SessionUser {
  /** Stable internal identity: eobc:<id>, hd:<id> or dealer:<id> */
  userId: string;
  name: string;
  role: 'admin' | 'dealer';
  capabilities: Capabilities;
  /** Help desk ticket creator */
  creator: boolean;
  /** Routing authenticator for ordinary users (dealers) */
  authenticator?: string;
}

const COOKIE = 'ctd_sid';

export class SessionStore {
  private map = new Map<string, { user: SessionUser; lastSeen: number }>();
  constructor(private idleMs: number, private secure: boolean) {}

  start(res: Response, user: SessionUser): void {
    const id = randomBytes(32).toString('hex'); // a fresh id at every login
    this.map.set(id, { user, lastSeen: Date.now() });
    res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: this.secure, path: '/', maxAge: this.idleMs });
  }

  private id(req: Request): string | undefined {
    const raw = req.headers.cookie ?? '';
    const m = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
    return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : undefined;
  }

  get(req: Request): SessionUser | null {
    const id = this.id(req);
    const rec = id ? this.map.get(id) : undefined;
    if (!id || !rec) return null;
    if (Date.now() - rec.lastSeen > this.idleMs) {
      this.map.delete(id);
      return null;
    }
    rec.lastSeen = Date.now(); // idle timeout, renewed by activity
    return rec.user;
  }

  end(req: Request, res: Response): void {
    const id = this.id(req);
    if (id) this.map.delete(id);
    res.clearCookie(COOKIE, { path: '/' });
  }
}
