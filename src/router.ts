import { useCallback, useEffect, useState } from 'react';
import type { ListKind } from './services';

export type Route =
  | { name: 'dashboard' }
  | { name: 'raise' }
  | { name: 'list'; list: ListKind }
  | { name: 'ticket'; number: string }
  | { name: 'mis' }
  | { name: 'reports' }
  | { name: 'console' }
  | { name: 'profile' };

const LIST_SLUG: Record<ListKind, string> = {
  mine: 'mine',
  'assigned-new': 'assigned/new',
  'assigned-inprogress': 'assigned/inprogress',
  'assigned-onhold': 'assigned/onhold',
  'assigned-resolved': 'assigned/resolved',
  'assigned-closed': 'assigned/closed',
  'assigned-reopened': 'assigned/reopened',
  helpdesk: 'helpdesk',
  closure: 'closure',
};

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'list': return `#/tickets/${LIST_SLUG[r.list]}`;
    case 'ticket': return `#/ticket/${encodeURIComponent(r.number)}`;
    default: return `#/${r.name}`;
  }
}

export function parseHash(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'raise') return { name: 'raise' };
  if (p[0] === 'mis') return { name: 'mis' };
  if (p[0] === 'reports') return { name: 'reports' };
  if (p[0] === 'console') return { name: 'console' };
  if (p[0] === 'profile') return { name: 'profile' };
  if (p[0] === 'ticket' && p[1]) return { name: 'ticket', number: decodeURIComponent(p[1]) };
  if (p[0] === 'tickets') {
    const slug = p.slice(1).join('/');
    const hit = (Object.keys(LIST_SLUG) as ListKind[]).find((k) => LIST_SLUG[k] === slug);
    if (hit) return { name: 'list', list: hit };
  }
  return { name: 'dashboard' };
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    window.location.hash = routeToHash(r);
  }, []);
  return [route, go];
}
