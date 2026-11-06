import { useCallback, useMemo, useState } from 'react';
import { api, type AuthResult, type ListKind } from '../services';
import { routeToHash, useRoute, type Route } from '../router';
import { SessionContext } from '../session';
import { ConsolePage } from './ConsolePage';
import { PlaceholderPage } from './PlaceholderPage';
import { ReportsPage } from './ReportsPage';
import { RaiseTicketPage } from './RaiseTicketPage';
import { SideMenu } from './SideMenu';
import { TicketDetailPage } from './TicketDetailPage';
import { initialListState, TicketListPage, type ListState } from './TicketListPage';

/** Signed-in area: role menu on the left, the current page on the right. */
export function AppShell({ user, onEnd }: { user: AuthResult; onEnd: () => void }) {
  const [route, go] = useRoute();
  const [lists, setLists] = useState<Partial<Record<ListKind, ListState>>>({});
  const [lastList, setLastList] = useState<ListKind>('mine');

  const endSession = useCallback(() => {
    void api.logout().catch(() => undefined).finally(() => {
      window.location.hash = '';
      onEnd();
    });
  }, [onEnd]);

  const ctx = useMemo(() => ({ user, navigate: go, endSession }), [user, go, endSession]);

  // Keep the list the user came from so Back returns to it with its filters intact.
  const current: Route = route;
  if (current.name === 'list' && current.list !== lastList) setLastList(current.list);

  const guard = (r: Route): Route => {
    const c = user.capabilities;
    if (r.name === 'list' && r.list !== 'mine') {
      if (!c.assignedTickets) return { name: 'dashboard' };
      if (r.list === 'helpdesk' && !c.helpdeskReview) return { name: 'dashboard' };
    }
    if (r.name === 'list' && r.list === 'closure' && !c.closeCases) return { name: 'dashboard' };
    if (r.name === 'mis' && !c.mis) return { name: 'dashboard' };
    if (r.name === 'reports' && !c.dashboard) return { name: 'dashboard' };
    if (r.name === 'console' && !c.console) return { name: 'dashboard' };
    return r;
  };
  const r = guard(current);
  if (routeToHash(r) !== routeToHash(current)) queueMicrotask(() => go(r));

  return (
    <SessionContext.Provider value={ctx}>
      <div className="shell">
        <SideMenu route={r} onLogout={endSession} />
        <div className="shell__content card-lite" id="content">
          {r.name === 'dashboard' && <PlaceholderPage kind="dashboard" />}
          {r.name === 'mis' && <PlaceholderPage kind="mis" />}
          {r.name === 'reports' && <ReportsPage />}
          {r.name === 'console' && <ConsolePage />}
          {r.name === 'profile' && <PlaceholderPage kind="profile" />}
          {r.name === 'raise' && <RaiseTicketPage />}
          {r.name === 'list' && (
            <TicketListPage
              key={r.list}
              list={r.list}
              state={lists[r.list] ?? initialListState()}
              onState={(s) => setLists((p) => ({ ...p, [r.list]: s }))}
            />
          )}
          {r.name === 'ticket' && <TicketDetailPage key={r.number} number={r.number} backTo={() => go({ name: 'list', list: lastList })} />}
        </div>
      </div>
    </SessionContext.Provider>
  );
}
