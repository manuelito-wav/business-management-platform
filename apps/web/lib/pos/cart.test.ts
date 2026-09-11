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

/** The active tab's lines -- most tests only care about the one tab they started with. */
function activeLines() {
  const state = useCartStore.getState();
  return state.tabs.find((tab) => tab.id === state.activeTabId)?.lines ?? [];
}

// The store is a module-level singleton (not React-scoped), so every test
// starts from a clean slate: a single fresh tab, no business assigned.
beforeEach(() => {
  useCartStore.getState().resetForBusiness("biz-1");
});

describe("useCartStore", () => {
  it("starts with a single tab named 'Venta 1'", () => {
    const state = useCartStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.label).toBe("Venta 1");
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
  });

  it("adds a new line for a product not already in the cart", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);

    expect(activeLines()).toEqual([
      expect.objectContaining({ productId: "prod-1", quantity: 1, unitPrice: 10000 }),
    ]);
  });

  it("merges a repeated unit-mode product into the same line instead of duplicating it", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);
    useCartStore.getState().addProduct(unitProduct(), 2);

    const lines = activeLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
  });

  it("gives each weighted-product scan its own line rather than merging quantities", () => {
    useCartStore.getState().addProduct(weightedProduct(), 500);
    useCartStore.getState().addProduct(weightedProduct(), 300);

    const lines = activeLines();
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.quantity)).toEqual([500, 300]);
  });

  it("setQuantity updates only the targeted line", () => {
    useCartStore.getState().addProduct(unitProduct({ id: "a" }), 1);
    useCartStore.getState().addProduct(unitProduct({ id: "b", name: "Sprite" }), 1);

    useCartStore.getState().setQuantity("a", 5);

    const lines = activeLines();
    expect(lines.find((line) => line.productId === "a")?.quantity).toBe(5);
    expect(lines.find((line) => line.productId === "b")?.quantity).toBe(1);
  });

  it("removeLine removes only the targeted line", () => {
    useCartStore.getState().addProduct(unitProduct({ id: "a" }), 1);
    useCartStore.getState().addProduct(unitProduct({ id: "b" }), 1);

    useCartStore.getState().removeLine("a");

    expect(activeLines().map((line) => line.productId)).toEqual(["b"]);
  });

  it("clear empties the active tab without closing it", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);

    useCartStore.getState().clear();

    expect(activeLines()).toEqual([]);
    expect(useCartStore.getState().tabs).toHaveLength(1);
  });

  it("carries a null salePrice through as unitPrice, never coercing it to a fabricated price", () => {
    useCartStore.getState().addProduct(unitProduct({ salePrice: null }), 1);

    expect(activeLines()[0]?.unitPrice).toBeNull();
  });
});

describe("useCartStore multi-tab behavior (SPECS.md 6.4)", () => {
  it("addTab creates a new empty tab, numbered after the highest existing number, and makes it active", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);

    useCartStore.getState().addTab();

    const state = useCartStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1]?.label).toBe("Venta 2");
    expect(state.tabs[1]?.lines).toEqual([]);
    expect(state.activeTabId).toBe(state.tabs[1]?.id);
    // The first tab's line is untouched by switching.
    expect(state.tabs[0]?.lines).toHaveLength(1);
  });

  it("keeps each tab's lines independent -- adding to one tab never affects another", () => {
    const firstTabId = useCartStore.getState().activeTabId;
    useCartStore.getState().addProduct(unitProduct({ id: "a" }), 1);
    useCartStore.getState().addTab();
    useCartStore.getState().addProduct(unitProduct({ id: "b" }), 1);

    useCartStore.getState().selectTab(firstTabId);

    expect(activeLines().map((line) => line.productId)).toEqual(["a"]);
  });

  it("selectTab switches the active tab", () => {
    const firstTabId = useCartStore.getState().activeTabId;
    useCartStore.getState().addTab();
    const secondTabId = useCartStore.getState().activeTabId;
    expect(secondTabId).not.toBe(firstTabId);

    useCartStore.getState().selectTab(firstTabId);

    expect(useCartStore.getState().activeTabId).toBe(firstTabId);
  });

  it("selectTab ignores an unknown tabId", () => {
    const activeTabId = useCartStore.getState().activeTabId;

    useCartStore.getState().selectTab("does-not-exist");

    expect(useCartStore.getState().activeTabId).toBe(activeTabId);
  });

  it("closeTab removes a tab and, if it was active, falls back to the previous one", () => {
    const firstTabId = useCartStore.getState().activeTabId;
    useCartStore.getState().addTab();
    const secondTabId = useCartStore.getState().activeTabId;
    useCartStore.getState().addTab();
    const thirdTabId = useCartStore.getState().activeTabId;

    useCartStore.getState().closeTab(thirdTabId);

    const state = useCartStore.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual([firstTabId, secondTabId]);
    expect(state.activeTabId).toBe(secondTabId);
  });

  it("closeTab on a non-active tab leaves the active tab untouched", () => {
    const firstTabId = useCartStore.getState().activeTabId;
    useCartStore.getState().addTab();
    const secondTabId = useCartStore.getState().activeTabId;

    useCartStore.getState().closeTab(firstTabId);

    const state = useCartStore.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual([secondTabId]);
    expect(state.activeTabId).toBe(secondTabId);
  });

  it("never closes the last remaining tab (SPECS.md 6.4 has no 'zero tabs' state)", () => {
    const onlyTabId = useCartStore.getState().activeTabId;

    useCartStore.getState().closeTab(onlyTabId);

    const state = useCartStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(onlyTabId);
  });

  it("a closed tab's number is not reused, even after a reload-like resetForBusiness/hydrate cycle", () => {
    useCartStore.getState().addTab(); // Venta 2
    useCartStore.getState().addTab(); // Venta 3
    const state = useCartStore.getState();
    const ventaTwo = state.tabs.find((tab) => tab.label === "Venta 2")!;
    useCartStore.getState().closeTab(ventaTwo.id);

    // Simulates recovering this exact draft (["Venta 1", "Venta 3"]) after
    // a page reload, then starting a new tab.
    const afterClose = useCartStore.getState();
    useCartStore.getState().hydrate("biz-1", afterClose.tabs, afterClose.activeTabId);
    useCartStore.getState().addTab();

    const labels = useCartStore.getState().tabs.map((tab) => tab.label);
    expect(labels).toEqual(["Venta 1", "Venta 3", "Venta 4"]);
  });
});

describe("useCartStore businessId scoping", () => {
  it("resetForBusiness starts a single fresh tab and records the business", () => {
    useCartStore.getState().addProduct(unitProduct(), 1);

    useCartStore.getState().resetForBusiness("biz-2");

    const state = useCartStore.getState();
    expect(state.businessId).toBe("biz-2");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.lines).toEqual([]);
  });

  it("hydrate replaces tabs/activeTabId wholesale for a recovered draft", () => {
    const tabs = [
      { id: "tab-x", label: "Venta 1", lines: [] },
      {
        id: "tab-y",
        label: "Venta 2",
        lines: [
          {
            productId: "prod-1",
            name: "Cola",
            saleMode: "unit" as const,
            weightUnit: null,
            unitPrice: 10000,
            quantity: 2,
            imageUrl: null,
          },
        ],
      },
    ];

    useCartStore.getState().hydrate("biz-1", tabs, "tab-y");

    const state = useCartStore.getState();
    expect(state.businessId).toBe("biz-1");
    expect(state.tabs).toEqual(tabs);
    expect(state.activeTabId).toBe("tab-y");
  });
});
