import { create } from 'zustand';
import type { PublicUser } from '@linguaai/validation/identity';

/**
 * The access token lives here — in memory, for the lifetime of the tab's JS
 * runtime — and nowhere else (E2-T22, Part 12: never `localStorage`/
 * `sessionStorage`, which are readable by any injected/XSS'd script). The
 * refresh token never reaches this store at all; it travels only in the
 * httpOnly cookie `apps/api` already sets (`auth.controller.ts`), invisible
 * to JS by construction. A page reload always loses `accessToken` — callers
 * re-establish a session via `client.ts`'s `bootstrapSession`, which trades
 * the still-live httpOnly cookie for a fresh one.
 */
export interface SessionState {
  accessToken: string | null;
  user: PublicUser | null;
  setSession: (accessToken: string, user: PublicUser) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clear: () => set({ accessToken: null, user: null }),
}));
