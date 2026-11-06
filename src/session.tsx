import { createContext, useContext } from 'react';
import type { AuthResult } from './services';
import type { Route } from './router';

export interface SessionValue {
  user: AuthResult;
  navigate: (r: Route) => void;
  /** Called on logout or when the server says the session has ended */
  endSession: () => void;
}
export const SessionContext = createContext<SessionValue | null>(null);
export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionContext');
  return v;
}
