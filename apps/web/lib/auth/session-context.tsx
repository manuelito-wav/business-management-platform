"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "../api/error";
import { apiRequest } from "../api/request";

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  activeBusinessId: string | null;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthorizedRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Attaches the current access token. On a 401 (the access token is
   * short-lived -- 15 minutes, identity.constants.ts) it silently refreshes
   * once via the httpOnly refresh cookie and retries once; if that also
   * fails, the session is cleared (-> "unauthenticated") and the original
   * error is thrown for the caller to handle.
   */
  authorizedRequest: <T = unknown>(path: string, options?: AuthorizedRequestOptions) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /** Injectable for tests; defaults to NEXT_PUBLIC_API_URL. */
  apiBaseUrl?: string;
  /** Injectable for tests; defaults to the global fetch (same DI pattern as lib/pos-cache/refresh.ts). */
  fetchImpl?: typeof fetch;
}

/**
 * Owns the browser-side session. The access token itself is kept only in a
 * ref (not persisted to localStorage/cookies by this code) -- the access
 * token's own short 15-minute lifetime plus the server's httpOnly refresh
 * cookie (identity/auth.controller.ts) is the intended defense-in-depth
 * design already established by the backend; a page reload silently
 * re-establishes the session via /auth/refresh rather than durably storing
 * the bearer token client-side.
 */
export function AuthProvider({ children, apiBaseUrl, fetchImpl }: AuthProviderProps) {
  const baseUrl = apiBaseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const fetchFn = useMemo(() => fetchImpl ?? fetch, [fetchImpl]);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const fetchMe = useCallback(
    (accessToken: string) =>
      apiRequest<AuthUser>({
        apiBaseUrl: baseUrl,
        path: "/auth/me",
        accessToken,
        fetchImpl: fetchFn,
      }),
    [baseUrl, fetchFn],
  );

  const applySession = useCallback(
    async (accessToken: string) => {
      accessTokenRef.current = accessToken;
      const me = await fetchMe(accessToken);
      setUser(me);
      setStatus("authenticated");
    },
    [fetchMe],
  );

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refreshSession = useCallback(async (): Promise<string> => {
    const session = await apiRequest<{ accessToken: string }>({
      apiBaseUrl: baseUrl,
      path: "/auth/refresh",
      method: "POST",
      fetchImpl: fetchFn,
    });
    accessTokenRef.current = session.accessToken;
    return session.accessToken;
  }, [baseUrl, fetchFn]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const accessToken = await refreshSession();
        if (cancelled) {
          return;
        }
        await applySession(accessToken);
      } catch {
        if (!cancelled) {
          clearSession();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession, refreshSession]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const session = await apiRequest<{ accessToken: string }>({
        apiBaseUrl: baseUrl,
        path: "/auth/login",
        method: "POST",
        body: { identifier, password },
        fetchImpl: fetchFn,
      });
      await applySession(session.accessToken);
    },
    [applySession, baseUrl, fetchFn],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest({
        apiBaseUrl: baseUrl,
        path: "/auth/logout",
        method: "POST",
        accessToken: accessTokenRef.current,
        fetchImpl: fetchFn,
      });
    } finally {
      clearSession();
    }
  }, [baseUrl, clearSession, fetchFn]);

  const authorizedRequest = useCallback(
    async <T,>(path: string, options?: AuthorizedRequestOptions): Promise<T> => {
      try {
        return await apiRequest<T>({
          apiBaseUrl: baseUrl,
          path,
          method: options?.method,
          body: options?.body,
          accessToken: accessTokenRef.current,
          fetchImpl: fetchFn,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
        try {
          const accessToken = await refreshSession();
          return await apiRequest<T>({
            apiBaseUrl: baseUrl,
            path,
            method: options?.method,
            body: options?.body,
            accessToken,
            fetchImpl: fetchFn,
          });
        } catch {
          clearSession();
          throw error;
        }
      }
    },
    [baseUrl, clearSession, fetchFn, refreshSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, authorizedRequest }),
    [status, user, login, logout, authorizedRequest],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
