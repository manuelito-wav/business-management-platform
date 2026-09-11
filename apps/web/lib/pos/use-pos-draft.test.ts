import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PosCacheDatabase } from "../pos-cache/db";
import { useCartStore } from "./cart";
import { usePosDraft } from "./use-pos-draft";

const BUSINESS_A = "biz-draft-a";
const BUSINESS_B = "biz-draft-b";
const FAST_DEBOUNCE_MS = 10;

let db: PosCacheDatabase;

beforeEach(() => {
  // A fresh, uniquely-named database per test avoids any cross-test
  // leftover state (same reasoning as refresh.test.ts's own instances).
  db = new PosCacheDatabase(`pos-draft-test-${Math.random().toString(36).slice(2)}`);
  // The cart store is a module-level Zustand singleton (see cart.ts's own
  // doc comment) -- reset it to a business neither test uses, so each
  // test starts genuinely "loading" instead of reading a previous test's
  // leftover businessId/tabs (same pattern as cart.test.ts/page.test.tsx).
  useCartStore.getState().resetForBusiness("__unused_reset_business__");
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("usePosDraft", () => {
  it("starts 'loading' then becomes 'ready' with a single fresh tab when there is no persisted draft", async () => {
    const { result } = renderHook(() => usePosDraft(BUSINESS_A, { database: db }));

    expect(result.current).toBe("loading");
    await waitFor(() => expect(result.current).toBe("ready"));

    const state = useCartStore.getState();
    expect(state.businessId).toBe(BUSINESS_A);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.lines).toEqual([]);
  });

  it("hydrates the cart store from a persisted draft, preserving tabs and the active one", async () => {
    await db.posDrafts.put({
      businessId: BUSINESS_A,
      tabs: [
        { id: "tab-1", label: "Venta 1", lines: [] },
        {
          id: "tab-2",
          label: "Venta 2",
          lines: [
            {
              productId: "prod-1",
              name: "Cola",
              saleMode: "unit",
              weightUnit: null,
              unitPrice: 10000,
              quantity: 2,
              imageUrl: null,
            },
          ],
        },
      ],
      activeTabId: "tab-2",
      savedAt: new Date(),
    });

    const { result } = renderHook(() => usePosDraft(BUSINESS_A, { database: db }));
    await waitFor(() => expect(result.current).toBe("ready"));

    const state = useCartStore.getState();
    expect(state.tabs.map((tab) => tab.label)).toEqual(["Venta 1", "Venta 2"]);
    expect(state.activeTabId).toBe("tab-2");
    expect(state.tabs[1]?.lines).toHaveLength(1);
  });

  it("resets to a fresh tab when the store currently belongs to a different business (no full page reload)", async () => {
    const { result: first } = renderHook(() => usePosDraft(BUSINESS_A, { database: db }));
    await waitFor(() => expect(first.current).toBe("ready"));
    useCartStore.getState().addProduct(
      {
        id: "prod-1",
        businessId: BUSINESS_A,
        categoryId: "cat-1",
        name: "Cola",
        saleMode: "unit",
        weightUnit: null,
        imageUrl: null,
        status: "active",
        salePrice: 10000,
        identifiers: [],
      },
      1,
    );
    expect(useCartStore.getState().tabs[0]?.lines).toHaveLength(1);

    // Simulates a client-side navigation to a different business's POS,
    // without unmounting the module-level cart singleton.
    const { result: second } = renderHook(() => usePosDraft(BUSINESS_B, { database: db }));
    await waitFor(() => expect(second.current).toBe("ready"));

    const state = useCartStore.getState();
    expect(state.businessId).toBe(BUSINESS_B);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.lines).toEqual([]);
  });

  it("persists a cart change back to the draft table, debounced", async () => {
    const { result } = renderHook(() =>
      usePosDraft(BUSINESS_A, { database: db, debounceMs: FAST_DEBOUNCE_MS }),
    );
    await waitFor(() => expect(result.current).toBe("ready"));

    useCartStore.getState().addProduct(
      {
        id: "prod-1",
        businessId: BUSINESS_A,
        categoryId: "cat-1",
        name: "Cola",
        saleMode: "unit",
        weightUnit: null,
        imageUrl: null,
        status: "active",
        salePrice: 10000,
        identifiers: [],
      },
      1,
    );

    await waitFor(async () => {
      const draft = await db.posDrafts.get(BUSINESS_A);
      expect(draft?.tabs[0]?.lines).toHaveLength(1);
    });
  });

  it("flushes a pending debounced save immediately on unmount", async () => {
    const { result, unmount } = renderHook(() =>
      // A long debounce -- if unmount did not flush, the assertion below
      // would never see the write within the test's own timeout.
      usePosDraft(BUSINESS_A, { database: db, debounceMs: 60_000 }),
    );
    await waitFor(() => expect(result.current).toBe("ready"));

    useCartStore.getState().addProduct(
      {
        id: "prod-1",
        businessId: BUSINESS_A,
        categoryId: "cat-1",
        name: "Cola",
        saleMode: "unit",
        weightUnit: null,
        imageUrl: null,
        status: "active",
        salePrice: 10000,
        identifiers: [],
      },
      1,
    );

    unmount();

    await waitFor(async () => {
      const draft = await db.posDrafts.get(BUSINESS_A);
      expect(draft?.tabs[0]?.lines).toHaveLength(1);
    });
  });
});
