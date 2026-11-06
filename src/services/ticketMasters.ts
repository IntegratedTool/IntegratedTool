/**
 * MOCK ONLY. Routing rows are real copies of public.issue_routing_master; Type and Source are hard-coded
 * samples because no master table was supplied for them yet.
 */
import { fieldSetFor } from '../utils/fieldRules';
import { sampleRoutes } from './sampleRoutes';
import type { Option, RouteRow } from './ticketTypes';

export const allRoutes: RouteRow[] = sampleRoutes.map(([authenticator, wing, nature, category, subCategory]) => ({
  authenticator, wing, nature, category, subCategory, fieldSet: fieldSetFor(nature, category, subCategory),
}));

export const sampleTypes: Option[] = [
  { id: 'Query', label: 'Query' },
  { id: 'Issue / Problem', label: 'Issue / Problem' },
  { id: 'Service Request', label: 'Service Request' },
];
export const sampleSources: Option[] = [
  { id: 'Telephone', label: 'Telephone' },
  { id: 'Email', label: 'Email' },
  { id: 'Walk-in', label: 'Walk-in' },
];

/** Mock account ids */
export const HELPDESK_ID = 'admin-helpdesk';
export const OFFICER_ID = 'officer-0012345';

/** assign_to value (from the routing table) -> mock account. Unlisted values become non-login placeholder accounts. */
const named: Record<string, string> = { 'Assigning Officer': HELPDESK_ID, User3: HELPDESK_ID, TC01: OFFICER_ID };
export const assigneeIdFor = (assignTo: string) => named[assignTo] ?? `res:${assignTo.toLowerCase().replace(/\s+/g, '')}`;

const labels = new Map<string, string>([[HELPDESK_ID, 'Admin Helpdesk'], [OFFICER_ID, 'Demo Officer']]);
for (const [, , , , , to] of sampleRoutes) labels.set(assigneeIdFor(to), labels.get(assigneeIdFor(to)) ?? to);
export const roster: Option[] = [...labels].map(([id, label]) => ({ id, label }));
