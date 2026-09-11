import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { posCacheDatabase } from "../pos-cache/db";
import type { CachedPosConfiguration, CachedProduct } from "../pos-cache/types";
import {
  findExactIdentifierMatch,
  useCachedCategories,
  useCachedProducts,
  useQuickProducts,
} from "./pos-catalog";

const BUSINESS_ID = "pos-catalog-test-biz";

function product(overrides: Partial<CachedProduct>): CachedProduct {
  return {
    id: overrides.id ?? "prod-1",
    businessId: BUSINESS_ID,
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

function configuration(overrides: Partial<CachedPosConfiguration>): CachedPosConfiguration {
  return {
    businessId: BUSINESS_ID,
    businessTimezone: "America/Argentina/Buenos_Aires",
    paymentMethods: {},
    featureFlags: {},
    policies: {},
    registerPolicy: {},
    quickProducts: { productIds: [] },
    ...overrides,
  };
}

afterEach(async () => {
  await posCacheDatabase.products.where("businessId").equals(BUSINESS_ID).delete();
  await posCacheDatabase.categories.where("businessId").equals(BUSINESS_ID).delete();
  await posCacheDatabase.posConfiguration.delete(BUSINESS_ID);
});

describe("findExactIdentifierMatch", () => {
  const products = [
    product({ id: "a", identifiers: [{ type: "barcode", normalizedValue: "111" }] }),
    product({ id: "b", identifiers: [{ type: "sku", normalizedValue: "SKU-2" }] }),
  ];

  it("finds a product by an exact normalized identifier match, case-insensitively", () => {
    expect(findExactIdentifierMatch(products, "111")?.id).toBe("a");
    expect(findExactIdentifierMatch(products, "sku-2")?.id).toBe("b");
  });

  it("does not match a partial identifier substring (a scan is exact, not a search term)", () => {
    expect(findExactIdentifierMatch(products, "11")).toBeUndefined();
  });

  it("returns undefined for an empty term or no match", () => {
    expect(findExactIdentifierMatch(products, "")).toBeUndefined();
    expect(findExactIdentifierMatch(products, "999")).toBeUndefined();
  });
});

describe("useCachedProducts", () => {
  it("matches by name substring and scopes to the given business", async () => {
    await posCacheDatabase.products.bulkAdd([
      product({ id: "a", name: "Coca-Cola 500ml" }),
      product({ id: "b", name: "Sprite 500ml" }),
      product({ id: "c", name: "Other business's cola", businessId: "other-biz" }),
    ]);

    const { result } = renderHook(() => useCachedProducts(BUSINESS_ID, { search: "cola" }));

    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["a"]));
  });

  it("matches an exact identifier even when it does not appear in the name", async () => {
    await posCacheDatabase.products.bulkAdd([
      product({
        id: "a",
        name: "Coca-Cola 500ml",
        identifiers: [{ type: "barcode", normalizedValue: "7790895000015" }],
      }),
    ]);

    const { result } = renderHook(() =>
      useCachedProducts(BUSINESS_ID, { search: "7790895000015" }),
    );

    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["a"]));
  });

  it("filters by categoryId", async () => {
    await posCacheDatabase.products.bulkAdd([
      product({ id: "a", categoryId: "cat-1" }),
      product({ id: "b", categoryId: "cat-2" }),
    ]);

    const { result } = renderHook(() => useCachedProducts(BUSINESS_ID, { categoryId: "cat-2" }));

    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["b"]));
  });
});

describe("useQuickProducts", () => {
  it("resolves configured productIds to cached products, preserving configured order", async () => {
    await posCacheDatabase.products.bulkAdd([
      product({ id: "a", name: "Coca-Cola 500ml" }),
      product({ id: "b", name: "Sprite 500ml" }),
    ]);
    await posCacheDatabase.posConfiguration.put(
      configuration({ quickProducts: { productIds: ["b", "a"] } }),
    );

    const { result } = renderHook(() => useQuickProducts(BUSINESS_ID));

    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["b", "a"]));
  });

  it("silently skips a productId that no longer resolves to a cached product", async () => {
    await posCacheDatabase.products.bulkAdd([product({ id: "a" })]);
    await posCacheDatabase.posConfiguration.put(
      configuration({ quickProducts: { productIds: ["a", "deleted-product"] } }),
    );

    const { result } = renderHook(() => useQuickProducts(BUSINESS_ID));

    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["a"]));
  });

  it("skips a productId that resolves to a product owned by another business (defensive)", async () => {
    await posCacheDatabase.products.bulkAdd([
      product({ id: "a" }),
      product({ id: "foreign", businessId: "other-biz" }),
    ]);
    await posCacheDatabase.posConfiguration.put(
      configuration({ quickProducts: { productIds: ["a", "foreign"] } }),
    );

    const { result } = renderHook(() => useQuickProducts(BUSINESS_ID));

    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["a"]));
  });

  it("returns an empty list when no configuration is cached yet", async () => {
    const { result } = renderHook(() => useQuickProducts(BUSINESS_ID));

    await waitFor(() => expect(result.current).toEqual([]));
  });
});

describe("useCachedCategories", () => {
  it("returns categories scoped to the business, sorted by name", async () => {
    await posCacheDatabase.categories.bulkAdd([
      { id: "cat-b", businessId: BUSINESS_ID, name: "Snacks", status: "active" },
      { id: "cat-a", businessId: BUSINESS_ID, name: "Beverages", status: "active" },
      { id: "cat-c", businessId: "other-biz", name: "Other", status: "active" },
    ]);

    const { result } = renderHook(() => useCachedCategories(BUSINESS_ID));

    await waitFor(() => expect(result.current.map((c) => c.name)).toEqual(["Beverages", "Snacks"]));
  });
});
