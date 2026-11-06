/** MOCK ONLY: stands in for the server-side session (HttpOnly cookie) so mock ticket calls know the caller. */
import type { AuthResult, Capabilities, UserKind } from './types';

export interface SessionUser {
  userId: string;
  name: string;
  role: UserKind;
  capabilities: Capabilities;
}

let current: SessionUser | null = null;

export const getSession = () => current;
export const clearSession = () => {
  current = null;
};

const NONE: Capabilities = {
  assignedTickets: false,
  helpdeskReview: false,
  mis: false,
  viewAssignmentHistory: false,
  reassign: false,
  sendToHelpdesk: false,
  raise: true,
  closeCases: false,
  console: false,
  dashboard: false,
};

export function capabilitiesFor(role: UserKind): Capabilities {
  switch (role) {
    case 'admin':
      // Admin account doubles as the Helpdesk / Assigning Officer for the prototype.
      return { assignedTickets: true, helpdeskReview: true, mis: true, viewAssignmentHistory: true, reassign: true, sendToHelpdesk: false, raise: true, closeCases: true, console: false, dashboard: false };
    case 'officer':
      return { ...NONE, assignedTickets: true, sendToHelpdesk: true };
    default:
      return NONE;
  }
}

/** Build the AuthResult and start the mock session. */
export function startSession(
  role: UserKind,
  userId: string,
  name: string,
  prefill: AuthResult['prefill'] = {},
): AuthResult {
  const capabilities = capabilitiesFor(role);
  current = { userId, name, role, capabilities };
  return { displayName: name, userType: role, userId, capabilities, prefill };
}
