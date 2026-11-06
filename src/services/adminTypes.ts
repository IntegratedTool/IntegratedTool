/** Super Admin console and dashboard contracts. */
import type { Settings } from '../utils/settingsSchema';
import type { TicketStatus } from './ticketTypes';

export interface SettingsDoc {
  values: Settings;
  /** Who changed each setting last, and when (settings never changed have no entry) */
  meta: Record<string, { by: string; at: string }>;
}

export interface ReportFilters {
  /** '' = all wings */
  wing: string;
  year: number | null;
  /** 1-12, only with a year */
  month: number | null;
  /** '' = all caller types */
  caller: string;
}
export const emptyReportFilters = (): ReportFilters => ({ wing: '', year: null, month: null, caller: '' });

export interface CountRow {
  label: string;
  count: number;
}

export interface ReportSummary {
  filters: ReportFilters;
  years: number[];
  wings: string[];
  callers: string[];
  totals: {
    total: number;
    byStatus: Record<TicketStatus, number>;
    open: number;
    reopened: number;
    /** Average hours from raising to first resolution; null when nothing was resolved */
    avgResolutionHours: number | null;
  };
  chartYear: number;
  byMonth: { month: number; created: number; resolved: number }[];
  byNature: CountRow[];
  byCategory: CountRow[];
  byWing: CountRow[];
  byCaller: CountRow[];
  byAssignee: { name: string; open: number; done: number }[];
  /** Open cases by age */
  aging: CountRow[];
  generatedAt: string;
}

export interface AdminApi {
  getSettings(): Promise<SettingsDoc>;
  saveSettings(values: Settings): Promise<SettingsDoc>;
  getReport(f: ReportFilters): Promise<ReportSummary>;
  /** Link that downloads the filtered cases as CSV (the browser sends the session cookie) */
  exportUrl(f: ReportFilters): string;
}
