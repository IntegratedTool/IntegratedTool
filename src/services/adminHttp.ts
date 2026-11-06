/** Real HTTP client for the Super Admin console and the dashboard. */
import { siteConfig } from '../config/site';
import { qs, request } from './http';
import type { AdminApi, ReportFilters, ReportSummary, SettingsDoc } from './adminTypes';
import type { Settings } from '../utils/settingsSchema';

const params = (f: ReportFilters) => ({ wing: f.wing, year: f.year ?? '', month: f.month ?? '', caller: f.caller });

export const adminHttp: AdminApi = {
  getSettings: () => request<SettingsDoc>('/admin/settings'),
  saveSettings: (values: Settings) => request<SettingsDoc>('/admin/settings', { values }, 'PUT'),
  getReport: (f) => request<ReportSummary>(`/reports/summary?${qs(params(f))}`),
  exportUrl: (f) => `${siteConfig.apiBase}/reports/export.csv?${qs(params(f))}`,
};
