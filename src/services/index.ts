import { siteConfig } from '../config/site';
import { adminHttp } from './adminHttp';
import type { AdminApi } from './adminTypes';
import { httpApi } from './httpApi';
import { mockApi } from './mockApi';
import { ticketHttp } from './ticketHttp';
import { ticketMock } from './ticketMock';
import type { TicketApi } from './ticketTypes';
import type { AuthApi } from './types';

/** Components import `api` from here and never know which implementation is active. */
export const api: AuthApi = siteConfig.useMock ? mockApi : httpApi;
export const ticketApi: TicketApi = siteConfig.useMock ? ticketMock : ticketHttp;
/** The console and dashboard need the real server (they read and change shared data). */
const unavailable = () => Promise.reject(new Error('The console and reports need the database server.'));
export const adminApi: AdminApi = siteConfig.useMock
  ? { getSettings: unavailable, saveSettings: unavailable, getReport: unavailable, exportUrl: () => '#' }
  : adminHttp;
export type * from './adminTypes';
export { emptyReportFilters } from './adminTypes';
export { ApiError } from './types';
export type * from './types';
export { emptyFilters, STATUSES, DEFAULT_LIMITS } from './ticketTypes';
export type * from './ticketTypes';
