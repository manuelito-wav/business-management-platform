"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { posCacheDatabase } from "../pos-cache/db";
import type { CachedCategory, CachedProduct } from "../pos-cache/types";

/** Reactive read of the local POS cache (ROADMAP.md "add local POS reference cache") -- categories/products the discovery panel browses live in IndexedDB, not a live network round-trip per keystroke. */
export function useCachedCategories(businessId: string): CachedCategory[] {
  return (
    useLiveQuery(
      () => posCacheDatabase.categories.where("businessId").equals(businessId).sortBy("name"),
      [businessId],
    ) ?? []
  );
}

/**
 * Keyboard-first search (SPECS.md 6.2): matches product name (substring,
 * case-insensitive) or any identifier (exact normalized value -- a
 * barcode/SKU scan is exact, not partial). `categoryId` narrows the
 * "category/quick access" browsing mode; omit it for the general search box.
 */
export function useCachedProducts(
  businessId: string,
  options: { search?: string; categoryId?: string },
): CachedProduct[] {
  return (
    useLiveQuery(async () => {
      const businessProducts = await posCacheDatabase.products
        .where("businessId")
        .equals(businessId)
        .sortBy("name");
      const term = options.search?.trim().toLowerCase();
      const normalizedTerm = term ? term.toUpperCase() : null;

      return businessProducts.filter((product) => {
        if (options.categoryId && product.categoryId !== options.categoryId) {
          return false;
        }
        if (!term || !normalizedTerm) {
          return true;
        }
        return (
          product.name.toLowerCase().includes(term) ||
          product.identifiers.some((identifier) => identifier.normalizedValue === normalizedTerm)
        );
      });
    }, [businessId, options.search, options.categoryId]) ?? []
  );
}

/** An exact barcode/SKU match for `term`, if any -- used to add-on-Enter for a scanner-style fast flow. */
export function findExactIdentifierMatch(
  products: CachedProduct[],
  term: string,
): CachedProduct | undefined {
  const normalized = term.trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }
  return products.find((product) =>
    product.identifiers.some((identifier) => identifier.normalizedValue === normalized),
  );
}
