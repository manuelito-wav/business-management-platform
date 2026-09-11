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
 * Matches a product's name (substring, case-insensitive) or any
 * identifier (exact normalized value -- a barcode/SKU scan is exact, not
 * partial) against `search`. Shared by useCachedProducts (searching the
 * whole cached catalog) and the discovery panel's quick-products filter
 * (searching just the curated shortcut list) so "how search matches" has
 * exactly one implementation.
 */
export function matchesSearch(product: CachedProduct, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) {
    return true;
  }
  const normalizedTerm = term.toUpperCase();
  return (
    product.name.toLowerCase().includes(term) ||
    product.identifiers.some((identifier) => identifier.normalizedValue === normalizedTerm)
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
      const search = options.search ?? "";

      return businessProducts.filter((product) => {
        if (options.categoryId && product.categoryId !== options.categoryId) {
          return false;
        }
        return matchesSearch(product, search);
      });
    }, [businessId, options.search, options.categoryId]) ?? []
  );
}

/**
 * The business's configured "Quick Products / Rapidos" shortcuts
 * (ROADMAP.md "add configurable quick products"), resolved from the
 * cached configuration's ordered `productIds` against the cached product
 * catalog -- offline, like the rest of product discovery. `productIds` is
 * a plain reference list (see the API's QuickProductsConfig doc comment);
 * an ID that no longer resolves to a cached product for this business
 * (its product was deleted, or -- defensively -- it belongs to another
 * business) is silently skipped rather than surfaced as an error. Order
 * is preserved: it is the configured display order, not re-sorted by name
 * the way the general catalog view is.
 */
export function useQuickProducts(businessId: string): CachedProduct[] {
  return (
    useLiveQuery(async () => {
      const configuration = await posCacheDatabase.posConfiguration.get(businessId);
      const productIds = configuration?.quickProducts?.productIds ?? [];
      if (productIds.length === 0) {
        return [];
      }
      const resolved = await posCacheDatabase.products.bulkGet(productIds);
      return resolved.filter(
        (product): product is CachedProduct =>
          product !== undefined && product.businessId === businessId,
      );
    }, [businessId]) ?? []
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
