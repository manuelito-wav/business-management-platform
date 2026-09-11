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

interface CartState {
  lines: CartLine[];
  /** Adds a new line, or increments an existing one for the same product (unit mode only -- a second scan of a weighted product gets its own line, since each has its own weighed amount). */
  addProduct: (product: CachedProduct, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
}

/**
 * Ephemeral client-only cart state (CODESTYLE.md "Use focused local/
 * Zustand state only for ephemeral POS state") -- the first real use of
 * Zustand in this codebase, introduced exactly when needed (ROADMAP.md
 * "add POS product discovery and cart"). Deliberately not persisted: a
 * single implicit sale, no multi-tab support, no local draft recovery --
 * both are ROADMAP.md's next checkpoints ("add multi-tab POS drafts").
 * Never writes an inventory or financial fact itself; it is pure UI
 * state until a later checkpoint's "complete sale" command reads it.
 */
export const useCartStore = create<CartState>((set) => ({
  lines: [],
  addProduct: (product, quantity) =>
    set((state) => {
      if (product.saleMode === "unit") {
        const existing = state.lines.find((line) => line.productId === product.id);
        if (existing) {
          return {
            lines: state.lines.map((line) =>
              line.productId === product.id
                ? { ...line, quantity: line.quantity + quantity }
                : line,
            ),
          };
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
      return { lines: [...state.lines, newLine] };
    }),
  setQuantity: (productId, quantity) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.productId === productId ? { ...line, quantity } : line,
      ),
    })),
  removeLine: (productId) =>
    set((state) => ({ lines: state.lines.filter((line) => line.productId !== productId) })),
  clear: () => set({ lines: [] }),
}));
