import { create } from "zustand";
import type { CachedProduct } from "../pos-cache/types";

export interface CartLine {
  productId: string;
  name: string;
  saleMode: CachedProduct["saleMode"];
  weightUnit: CachedProduct["weightUnit"];
  /**
   * Integer ARS minor units (D-005). For saleMode "weighted", this is the
   * price PER KILOGRAM -- SPECS.md/DECISIONS.md never state a weighted
   * pricing basis explicitly, so this is a deliberate, documented
   * assumption matching the near-universal retail convention (e.g. deli
   * ham priced "per kilo"), not a fabricated fact: ProductPricing.salePrice
   * itself carries no unit-basis field either way, so nothing in the
   * backend contradicts it, and it costs nothing to correct later if the
   * real convention differs.
   */
  unitPrice: number | null;
  /** Whole units for "unit"; integer grams for "weighted" (D-008). */
  quantity: number;
  imageUrl: string | null;
}

/**
 * One independent in-progress sale (SPECS.md 6.4: "The POS must support
 * multiple concurrent sale tabs. The behavior should resemble browser
 * tabs... Each sale tab should maintain its own independent state until
 * completed or cancelled").
 */
export interface SaleTab {
  id: string;
  /**
   * Display label only ("Venta 1", "Venta 2", ...) -- numbered by
   * creation order and never reused within a session, so a tab keeps its
   * own label even after an earlier tab closes. No relation to any
   * backend sale identifier: a real sale does not exist until a later
   * checkpoint's "complete sale" command runs (ARCHITECTURE.md POS:
   * "Multiple in-progress sale tabs are client-side drafts and do not
   * create authoritative facts").
   */
  label: string;
  lines: CartLine[];
}

interface CartState {
  /**
   * Which business's tabs are currently loaded, or null before
   * lib/pos/use-pos-draft.ts hydrates/resets it for a specific business.
   * The store below is a module-level singleton (see its own doc
   * comment), so this is what lets that one singleton be reused safely
   * across a client-side navigation between two different businesses'
   * POS workspaces without leaking one business's tabs into another's.
   */
  businessId: string | null;
  tabs: SaleTab[];
  activeTabId: string;
  addTab: () => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  /** Adds a new line to the active tab, or increments an existing one for the same product (unit mode only -- a second scan of a weighted product gets its own line, since each has its own weighed amount). */
  addProduct: (product: CachedProduct, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  /** Empties the active tab's lines without closing the tab itself. */
  clear: () => void;
  /** Replaces the whole store with a specific business's recovered draft. lib/pos/use-pos-draft.ts only -- never call from POS UI code directly. */
  hydrate: (businessId: string, tabs: SaleTab[], activeTabId: string) => void;
  /** Starts a single fresh empty tab for a business with no recoverable draft (or that the store did not already belong to). lib/pos/use-pos-draft.ts only. */
  resetForBusiness: (businessId: string) => void;
}

/** "Venta " + the smallest number not already used by an existing tab's label -- immune to a closed tab's number being "reused" after a reload (a persisted draft may skip numbers, e.g. ["Venta 1", "Venta 3"] once "Venta 2" was closed). A custom/renamed label (not matching this pattern) simply does not contribute to the count. */
function nextLabelNumber(existingTabs: SaleTab[]): number {
  const numbers = existingTabs.map((tab) => {
    const match = /^Venta (\d+)$/.exec(tab.label);
    return match ? Number(match[1]) : 0;
  });
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

function createTab(existingTabs: SaleTab[]): SaleTab {
  return { id: crypto.randomUUID(), label: `Venta ${nextLabelNumber(existingTabs)}`, lines: [] };
}

function updateActiveTabLines(
  state: Pick<CartState, "tabs" | "activeTabId">,
  updateLines: (lines: CartLine[]) => CartLine[],
): Pick<CartState, "tabs"> {
  return {
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId ? { ...tab, lines: updateLines(tab.lines) } : tab,
    ),
  };
}

/**
 * Ephemeral client-only cart state (CODESTYLE.md "Use focused local/
 * Zustand state only for ephemeral POS state") -- multiple independent
 * sale tabs (ROADMAP.md "add multi-tab POS drafts"), each mutated
 * implicitly through whichever is `activeTabId` (the "browser tabs"
 * mental model: actions apply to the currently focused tab). A module-
 * level singleton, so it is deliberately businessId-aware (see
 * `businessId` above) rather than assuming only one business is ever
 * open in a browser tab's lifetime. Never writes an inventory or
 * financial fact itself; it is pure UI state until a later checkpoint's
 * "complete sale" command reads the active tab. Local draft recovery
 * (persisting/restoring `tabs`/`activeTabId` across a page reload) lives
 * in lib/pos/use-pos-draft.ts, not here -- this store only holds state
 * in memory and exposes `hydrate`/`resetForBusiness` for that hook to
 * call.
 */
export const useCartStore = create<CartState>((set) => {
  const initialTab = createTab([]);

  return {
    businessId: null,
    tabs: [initialTab],
    activeTabId: initialTab.id,

    addTab: () =>
      set((state) => {
        const tab = createTab(state.tabs);
        return { tabs: [...state.tabs, tab], activeTabId: tab.id };
      }),

    closeTab: (tabId) =>
      set((state) => {
        if (state.tabs.length <= 1) {
          // Always at least one tab -- SPECS.md 6.4 has no "zero tabs" state.
          return state;
        }
        const closingIndex = state.tabs.findIndex((tab) => tab.id === tabId);
        if (closingIndex === -1) {
          return state;
        }
        const remaining = state.tabs.filter((tab) => tab.id !== tabId);
        if (state.activeTabId !== tabId) {
          return { tabs: remaining };
        }
        // The active tab was closed -- fall back to whichever tab was
        // immediately before it (or the new first tab, if it was first).
        const fallback = remaining[Math.max(0, closingIndex - 1)] ?? remaining[0];
        return { tabs: remaining, activeTabId: fallback!.id };
      }),

    selectTab: (tabId) =>
      set((state) => (state.tabs.some((tab) => tab.id === tabId) ? { activeTabId: tabId } : state)),

    addProduct: (product, quantity) =>
      set((state) =>
        updateActiveTabLines(state, (lines) => {
          if (product.saleMode === "unit") {
            const existing = lines.find((line) => line.productId === product.id);
            if (existing) {
              return lines.map((line) =>
                line.productId === product.id
                  ? { ...line, quantity: line.quantity + quantity }
                  : line,
              );
            }
          }
          const newLine: CartLine = {
            productId: product.id,
            name: product.name,
            saleMode: product.saleMode,
            weightUnit: product.weightUnit,
            unitPrice: product.salePrice,
            quantity,
            imageUrl: product.imageUrl,
          };
          return [...lines, newLine];
        }),
      ),

    setQuantity: (productId, quantity) =>
      set((state) =>
        updateActiveTabLines(state, (lines) =>
          lines.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
        ),
      ),

    removeLine: (productId) =>
      set((state) =>
        updateActiveTabLines(state, (lines) =>
          lines.filter((line) => line.productId !== productId),
        ),
      ),

    clear: () => set((state) => updateActiveTabLines(state, () => [])),

    hydrate: (businessId, tabs, activeTabId) => set({ businessId, tabs, activeTabId }),

    resetForBusiness: (businessId) => {
      const tab = createTab([]);
      set({ businessId, tabs: [tab], activeTabId: tab.id });
    },
  };
});

/** The currently focused sale tab -- what every POS component reads/mutates by default. */
export function useActiveTab(): SaleTab {
  return useCartStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0]!,
  );
}
