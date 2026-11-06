import type { FieldSet } from '../services/ticketTypes';

/**
 * Which additional fields a classification needs (functional requirements, section 3).
 * issue_routing_master has no column for this, so the rule lives here and is shared by the form
 * (to show fields) and the server (to validate them). Adjust here when the department confirms the mapping.
 */
export function fieldSetFor(nature: string, category: string, subCategory = ''): FieldSet {
  const n = nature.trim().toLowerCase();
  const c = category.trim().toLowerCase();
  const s = subCategory.trim().toLowerCase();
  if (n === 'hardware') return 'hardware';
  if (n === 'network') return 'network';
  if (/\btask\b/.test(c) || /\btask\b/.test(s)) return 'task';
  if (c === 'gst') return 'gst';
  return 'none';
}
