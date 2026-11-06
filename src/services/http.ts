/** Shared fetch wrapper for the real backend. The session is an HttpOnly cookie; nothing secret is kept in JS. */
import { siteConfig } from '../config/site';
import { ApiError, type ApiErrorCode } from './types';

/** Sent on every request; the server rejects state-changing calls without it (simple CSRF defence beside SameSite cookies). */
const CSRF_HEADER = { 'X-Requested-With': 'ctd-portal' };

export async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  return send<T>(path, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...CSRF_HEADER },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** multipart/form-data (ticket creation with attachments). The browser sets the boundary header itself. */
export async function requestForm<T>(path: string, form: FormData): Promise<T> {
  return send<T>(path, { method: 'POST', headers: { Accept: 'application/json', ...CSRF_HEADER }, body: form });
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${siteConfig.apiBase}${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError('NETWORK');
  }
  if (res.ok) return res.status === 204 ? (undefined as T) : ((await res.json()) as T);

  let code: ApiErrorCode =
    res.status === 401 ? 'UNAUTHENTICATED' : res.status === 403 || res.status === 404 ? 'FORBIDDEN' : res.status === 503 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN';
  let meta: Record<string, number | string> = {};
  try {
    const b = (await res.json()) as { code?: ApiErrorCode; meta?: Record<string, number | string> };
    if (b.code) code = b.code;
    if (b.meta) meta = b.meta;
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(code, meta);
}

export const qs = (o: Record<string, string | number | boolean>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => [k, String(v)])).toString();
