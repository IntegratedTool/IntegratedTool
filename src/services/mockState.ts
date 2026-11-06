/**
 * MOCK ONLY. Counters and locks kept in the browser so they survive a page refresh in the prototype.
 * A browser-side counter can be bypassed (clear storage, call the API directly): the real backend must
 * enforce CAPTCHA requirement, officer blocking and OTP attempt locks server-side.
 * No passwords, OTPs or secrets are stored here.
 */
export interface GuardState {
  fails: number;
  lockUntil: number;
}
export interface MockState {
  credFails: Record<string, number>;
  blocked: Record<string, boolean>;
  otpGuards: Record<string, GuardState>;
}

const KEY = 'ctd-mock-state-v1';
let memory: MockState | null = null;

const empty = (): MockState => ({ credFails: {}, blocked: {}, otpGuards: {} });

export function getState(): MockState {
  if (!memory) {
    try {
      const raw = localStorage.getItem(KEY);
      memory = raw ? { ...empty(), ...(JSON.parse(raw) as Partial<MockState>) } : empty();
    } catch {
      memory = empty(); // storage unavailable: counters then live only in memory
    }
  }
  return memory;
}

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

export function resetMockState(): void {
  memory = empty();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
