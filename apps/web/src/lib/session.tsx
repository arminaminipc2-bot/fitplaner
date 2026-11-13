import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AuthUser } from "./api";

/**
 * The session is the httpOnly cookie; this context only mirrors who the server
 * says we are. Nothing here persists a token — reloading the page re-reads the
 * cookie through `/auth/me`, which is also why a 401 anywhere means "signed out".
 */

type SessionState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: AuthUser };

type SessionValue = SessionState & {
  signIn: (email: string, password: string) => Promise<AuthUser | null>;
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
  /** After a profile mutation, so the shell header and the guard stay correct. */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });

  const load = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const { user } = await api.auth.me();
      setState(user ? { status: "authenticated", user } : { status: "anonymous", user: null });
      return user;
    } catch {
      // Unreachable or broken: either way there is no verified identity to show.
      setState({ status: "anonymous", user: null });
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
      signIn: async (email, password) => {
        await api.auth.login({ email, password });
        return load();
      },
      signUp: async (email, password, displayName) => {
        await api.auth.register({ email, password, displayName });
        return load();
      },
      signOut: async () => {
        try {
          await api.auth.logout();
        } finally {
          setState({ status: "anonymous", user: null });
        }
      },
      refresh: async () => {
        await load();
      },
    }),
    [state, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
