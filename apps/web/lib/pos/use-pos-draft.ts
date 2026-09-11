"use client";

import { useEffect, useRef } from "react";
import { posCacheDatabase } from "../pos-cache/db";
import type { PosCacheDatabase } from "../pos-cache/db";
import { useCartStore } from "./cart";

export type PosDraftStatus = "loading" | "ready";

const DRAFT_SAVE_DEBOUNCE_MS = 400;

export interface UsePosDraftOptions {
  /** Injectable for tests; defaults to the shared posCacheDatabase singleton. */
  database?: PosCacheDatabase;
  /** Injectable for tests, so they don't need to wait out the real debounce window. Defaults to DRAFT_SAVE_DEBOUNCE_MS. */
  debounceMs?: number;
}

/**
 * ROADMAP.md "add multi-tab POS drafts": "lightweight strategic local
 * draft recovery using the Phase 2 store". On mount, loads this
 * business's persisted draft (if any) into the module-level cart
 * singleton (lib/pos/cart.ts) -- or starts a single fresh tab if there is
 * none, or if the singleton currently belongs to a DIFFERENT business
 * (the user switched businesses without a full page reload; see
 * cart.ts's own `businessId` doc comment for why that matters). From
 * then on, every subsequent cart change is persisted back, debounced so a
 * fast typing/quantity-adjustment burst does not write on every
 * keystroke, and flushed immediately on unmount so a change made right
 * before navigating away is not silently dropped.
 *
 * Lower-durability, best-effort recovery by design (see
 * CachedPosDraft's own doc comment) -- this is not the durable outbox
 * ARCHITECTURE.md's Offline section reserves for FINALIZED operations
 * (a later Phase 6 checkpoint).
 */
export function usePosDraft(businessId: string, options: UsePosDraftOptions = {}): PosDraftStatus {
  const database = options.database ?? posCacheDatabase;
  const debounceMs = options.debounceMs ?? DRAFT_SAVE_DEBOUNCE_MS;
  const hydratedForRef = useRef<string | null>(null);
  const status = useCartStore((state) => (state.businessId === businessId ? "ready" : "loading"));

  useEffect(() => {
    if (hydratedForRef.current === businessId) {
      return;
    }
    hydratedForRef.current = businessId;

    let cancelled = false;
    void database.posDrafts.get(businessId).then((draft) => {
      if (cancelled) {
        return;
      }
      if (draft && draft.tabs.length > 0) {
        useCartStore.getState().hydrate(businessId, draft.tabs, draft.activeTabId);
      } else {
        useCartStore.getState().resetForBusiness(businessId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, database]);

  useEffect(() => {
    let pendingTimeout: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      const state = useCartStore.getState();
      if (state.businessId !== businessId) {
        return;
      }
      void database.posDrafts.put({
        businessId,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        savedAt: new Date(),
      });
    };

    const unsubscribe = useCartStore.subscribe((state) => {
      if (state.businessId !== businessId) {
        return;
      }
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
      }
      pendingTimeout = setTimeout(save, debounceMs);
    });

    return () => {
      unsubscribe();
      if (pendingTimeout) {
        // A change was pending when this unmounted (e.g. navigating away
        // right after an edit) -- flush it now rather than losing it.
        clearTimeout(pendingTimeout);
        save();
      }
    };
  }, [businessId, database, debounceMs]);

  return status;
}
