import { useState } from 'react';
import { useI18n, type TKey } from '../i18n';
import { routeToHash, type Route } from '../router';
import type { ListKind } from '../services';
import { useSession } from '../session';

interface Item {
  key: string;
  label: TKey;
  route: Route;
}

const ASSIGNED: { list: ListKind; label: TKey }[] = [
  { list: 'assigned-new', label: 'nav.new' },
  { list: 'assigned-inprogress', label: 'nav.inprogress' },
  { list: 'assigned-onhold', label: 'nav.onhold' },
  { list: 'assigned-resolved', label: 'nav.resolved' },
  { list: 'assigned-closed', label: 'nav.closed' },
  { list: 'assigned-reopened', label: 'nav.reopened' },
];

const same = (a: Route, b: Route) => routeToHash(a) === routeToHash(b);

export function SideMenu({ route, onLogout }: { route: Route; onLogout: () => void }) {
  const { t } = useI18n();
  const { user, navigate } = useSession();
  const c = user.capabilities;
  const inAssigned = route.name === 'list' && route.list.startsWith('assigned');
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const link = (it: Item, sub = false) => (
    <a
      href={routeToHash(it.route)}
      className={`menu__link${sub ? ' menu__link--sub' : ''}`}
      aria-current={same(route, it.route) ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        setMobileOpen(false);
        navigate(it.route);
      }}
    >
      {t(it.label)}
    </a>
  );

  return (
    <aside className="side">
      <p className="side__user">{t('nav.signedIn', { name: user.displayName })}</p>
      <button type="button" className="btn btn--secondary side__toggle" aria-expanded={mobileOpen} aria-controls="side-nav" onClick={() => setMobileOpen((v) => !v)}>
        {t('nav.menu')}
      </button>
      <nav id="side-nav" aria-label={t('nav.label')} className={mobileOpen ? 'is-open' : ''}>
        <ul className="menu">
          <li>{link({ key: 'd', label: 'nav.dashboard', route: { name: 'dashboard' } })}</li>
          {c.raise && <li>{link({ key: 'r', label: 'nav.raise', route: { name: 'raise' } })}</li>}
          <li>{link({ key: 'm', label: 'nav.mine', route: { name: 'list', list: 'mine' } })}</li>
          {c.assignedTickets && (
            <li>
              <button type="button" className={`menu__link menu__group${inAssigned ? ' is-current' : ''}`} aria-expanded={open || inAssigned} onClick={() => setOpen((v) => !v)}>
                {t('nav.assigned')} <span aria-hidden="true">{open || inAssigned ? '▾' : '▸'}</span>
              </button>
              {(open || inAssigned) && (
                <ul className="menu menu--sub">
                  {ASSIGNED.map((a) => <li key={a.list}>{link({ key: a.list, label: a.label, route: { name: 'list', list: a.list } }, true)}</li>)}
                </ul>
              )}
            </li>
          )}
          {c.helpdeskReview && <li>{link({ key: 'h', label: 'nav.helpdesk', route: { name: 'list', list: 'helpdesk' } })}</li>}
          {c.closeCases && <li>{link({ key: 'cl', label: 'nav.closure', route: { name: 'list', list: 'closure' } })}</li>}
          {c.dashboard && <li>{link({ key: 'rep', label: 'nav.reports', route: { name: 'reports' } })}</li>}
          {c.console && <li>{link({ key: 'con', label: 'nav.console', route: { name: 'console' } })}</li>}
          {c.mis && !c.dashboard && <li>{link({ key: 'mis', label: 'nav.mis', route: { name: 'mis' } })}</li>}
          <li>{link({ key: 'p', label: 'nav.profile', route: { name: 'profile' } })}</li>
          <li>
            <button type="button" className="menu__link menu__logout" onClick={onLogout}>{t('nav.logout')}</button>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
