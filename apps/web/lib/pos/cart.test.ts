import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "./cart";
import type { CachedProduct } from "../pos-cache/types";

function unitProduct(overrides: Partial<CachedProduct> = {}): CachedProduct {
  return {
    id: "prod-1",
    businessId: "biz-1",
    categoryId: "cat-1",
    name: "Cola",
    saleMode: "unit",
    weightUnit: null,
    imageUrl: null,
    status: "active",
    salePrice: 10000,
    identifiers: [],
    ...overrides,
  };
}

function weightedProduct(overrides: Partial<CachedProduct> = {}): CachedProduct {
  return {
    id: "prod-2",
    businessId: "biz-1",
    categoryId: "cat-1",
    name: "Jamón",
    saleMode: "weighted",
    weightUnit: "kg",
    imageUrl: null,
    status: "active",
    salePrice: 50000,
    identifiers: [],
    ...overrides,
  };
}

// The store is a module-level singleton (not React-scoped), so every test
// starts from a clean slate.
beforeEach(() => {
  useCartStore.getState().clear();
});

describe("useCartStore", () => {
  it("adds a new line for a product not already in the cart", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);

    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: "prod-1", quantity: 1, unitPrice: 10000 }),
    ]);
  });

  it("merges a repeated unit-mode product into the same line instead of duplicating it", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);
    useCartStore.getState().addProduct(unitProduct(), 2);

    const { lines } = useCartStore.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
  });

  it("gives each weighted-product scan its own line rather than merging quantities", () => {
    useCartStore.getState().addProduct(weightedProduct(), 500);
    useCartStore.getState().addProduct(weightedProduct(), 300);

    const { lines } = useCartStore.getState();
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.quantity)).toEqual([500, 300]);
  });

  it("setQuantity updates only the targeted line", () => {
    useCartStore.getState().addProduct(unitProduct({ id: "a" }), 1);
    useCartStore.getState().addProduct(unitProduct({ id: "b", name: "Sprite" }), 1);

    useCartStore.getState().setQuantity("a", 5);

    const { lines } = useCartStore.getState();
    expect(lines.find((line) => line.productId === "a")?.quantity).toBe(5);
    expect(lines.find((line) => line.productId === "b")?.quantity).toBe(1);
  });

  it("removeLine removes only the targeted line", () => {
    useCartStore.getState().addProduct(unitProduct({ id: "a" }), 1);
    useCartStore.getState().addProduct(unitProduct({ id: "b" }), 1);

    useCartStore.getState().removeLine("a");

    expect(useCartStore.getState().lines.map((line) => line.productId)).toEqual(["b"]);
  });

  it("clear empties the cart", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);

    useCartStore.getState().clear();

    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("carries a null salePrice through as unitPrice, never coercing it to a fabricated price", () => {
    useCartStore.getState().addProduct(unitProduct({ salePrice: null }), 1);

    expect(useCartStore.getState().lines[0]?.unitPrice).toBeNull();
  });
});
