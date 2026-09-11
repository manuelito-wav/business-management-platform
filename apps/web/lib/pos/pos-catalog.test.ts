import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { posCacheDatabase } from "../pos-cache/db";
import type { CachedProduct } from "../pos-cache/types";
import { findExactIdentifierMatch, useCachedCategories, useCachedProducts } from "./pos-catalog";

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

afterEach(async () => {
  await posCacheDatabase.products.where("businessId").equals(BUSINESS_ID).delete();
  await posCacheDatabase.categories.where("businessId").equals(BUSINESS_ID).delete();
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
