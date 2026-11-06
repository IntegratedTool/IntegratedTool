import type { DbConfig } from '../config.js';
import type { Queryable } from '../dbAdapter.js';
import { fieldSetFor } from '../../../src/utils/fieldRules.js';
import type { RouteRow } from '../../../src/services/ticketTypes.js';

const T = (c: DbConfig) => `"${c.schema}"."${c.tables.routing}"`;

interface Raw {
  id: string | number;
  authenticator: string;
  wing: string;
  nature_of_issue: string;
  issue_category: string;
  sub_category: string;
  assign_to: string;
}
const clean = (r: Raw): RouteRow & { id: number; assignTo: string } => {
  const nature = r.nature_of_issue.trim();
  const category = r.issue_category.trim();
  const subCategory = (r.sub_category ?? '').trim();
  return { id: Number(r.id), authenticator: r.authenticator.trim(), wing: r.wing.trim(), nature, category, subCategory, assignTo: r.assign_to.trim(), fieldSet: fieldSetFor(nature, category, subCategory) };
};

/** Active routing rows. `authenticator` = null returns every caller type (Help desk ticket creators). */
export async function activeRoutes(q: Queryable, c: DbConfig, authenticator: string | null) {
  const r = await q.query<Raw>(
    `select id, authenticator, wing, nature_of_issue, issue_category, sub_category, assign_to from ${T(c)}
      where upper(btrim(active_yn)) = 'Y' ${authenticator ? 'and lower(btrim(authenticator)) = lower($1)' : ''}
      order by wing, nature_of_issue, issue_category, sub_category`,
    authenticator ? [authenticator.trim()] : [],
  );
  return r.rows.map(clean);
}

/** The single active rule for a classification. More than one rule with different assignees counts as "no route": never guess. */
export async function findRoute(q: Queryable, c: DbConfig, authenticator: string, nature: string, category: string, subCategory: string) {
  const r = await q.query<Raw>(
    `select id, authenticator, wing, nature_of_issue, issue_category, sub_category, assign_to from ${T(c)}
      where upper(btrim(active_yn)) = 'Y' and lower(btrim(authenticator)) = lower($1)
        and btrim(nature_of_issue) = $2 and btrim(issue_category) = $3 and btrim(coalesce(sub_category,'')) = $4
      order by id`,
    [authenticator.trim(), nature, category, subCategory],
  );
  const rows = r.rows.map(clean);
  if (rows.length === 0) return null;
  if (new Set(rows.map((x) => `${x.wing}|${x.assignTo.toLowerCase()}`)).size > 1) return null;
  return rows[0];
}
