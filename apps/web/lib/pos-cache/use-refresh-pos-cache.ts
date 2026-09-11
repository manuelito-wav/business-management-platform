"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/session-context";
import { refreshPosCache } from "./refresh";

export type PosCacheRefreshStatus = "refreshing" | "ready" | "error";

/**
 * Wires refreshPosCache (ROADMAP.md "add local POS reference cache") to
 * the now-real session layer -- no auth/session wiring existed in
 * apps/web yet when that checkpoint shipped, so this hook is its first
 * real caller. Shares AuthProvider's own apiBaseUrl/fetchImpl (injectable
 * there for tests) rather than re-resolving them independently. Refreshes
 * once per (businessId) while the caller mounts it; the POS workspace
 * mounts this before showing product discovery, so the cache is never
 * more than one page-load stale.
 */
export function useRefreshPosCache(businessId: string): { status: PosCacheRefreshStatus } {
  // `status` here is AuthProvider's own auth status, not this hook's
  // return value (also called "status") -- aliased to avoid the clash.
  // It matters as an effect dependency because getAccessToken's identity
  // never changes (a stable ref-reading callback), so the effect would
  // otherwise never re-run once auth finishes loading and a token
  // actually becomes available.
  const { status: authStatus, getAccessToken, apiBaseUrl, fetchImpl } = useAuth();
  const [status, setStatus] = useState<PosCacheRefreshStatus>("refreshing");
  const requestedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated" || requestedForRef.current === businessId) {
      return;
    }
    requestedForRef.current = businessId;
    const accessToken = getAccessToken();
    if (!accessToken) {
      requestedForRef.current = null;
      return;
    }

    // Not resetting to "refreshing" here (that would be a synchronous
    // setState in the effect body, flagged by react-hooks/set-state-in-
    // effect): the initial state already is "refreshing", which covers
    // the normal case. A businessId change while this stays mounted --
    // not a real navigation this app produces today, since switching
    // business goes through /select-business, unmounting this tree --
    // would briefly keep showing the previous businessId's status until
    // this refresh resolves; an acceptable trade-off for a case that
    // does not occur in practice.
    let cancelled = false;
    void refreshPosCache({
      apiBaseUrl,
      accessToken,
      businessId,
      fetchImpl,
    })
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, authStatus, businessId, fetchImpl, getAccessToken]);

  return { status };
}
