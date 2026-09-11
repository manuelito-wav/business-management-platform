"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useCartStore } from "../../lib/pos/cart";
import {
  findExactIdentifierMatch,
  matchesSearch,
  useCachedCategories,
  useCachedProducts,
  useQuickProducts,
} from "../../lib/pos/pos-catalog";
import type { CachedProduct } from "../../lib/pos-cache/types";
import { ProductTile } from "./product-tile";

export interface PosDiscoveryProps {
  businessId: string;
}

/** "Todas" (the whole catalog), one category, or the curated "Rapidos" shortcut list -- mutually exclusive, same as the pill row's own visual selection. */
type DiscoveryFilter =
  { kind: "all" } | { kind: "category"; categoryId: string } | { kind: "quick" };

/**
 * SPECS.md 6.2's "Right Section: Product Discovery" -- keyboard-first
 * search (name/barcode/SKU), category browsing, configurable "Quick
 * Products / Rapidos" shortcuts (ROADMAP.md "add configurable quick
 * products"), and the full catalog remains searchable beyond whatever
 * filter is selected.
 */
export function PosDiscovery({ businessId }: PosDiscoveryProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DiscoveryFilter>({ kind: "all" });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addProduct = useCartStore((state) => state.addProduct);

  const categories = useCachedCategories(businessId);
  const quickProducts = useQuickProducts(businessId);
  const catalogProducts = useCachedProducts(businessId, {
    search,
    categoryId: filter.kind === "category" ? filter.categoryId : undefined,
  });
  // The quick-products shortcut list is small and already resolved client-
  // side (see useQuickProducts), so its own search narrowing happens here
  // rather than re-querying Dexie -- same matching rule as the general
  // catalog search (matchesSearch), just applied to a shorter list.
  const products =
    filter.kind === "quick"
      ? quickProducts.filter((product) => matchesSearch(product, search))
      : catalogProducts;

  const handleSelectProduct = (product: CachedProduct) => {
    // A weighted product needs its weight entered before it contributes
    // to the total (see cart.ts) -- it still gets added immediately so
    // the cashier can fill that in without a second step.
    addProduct(product, product.saleMode === "weighted" ? 0 : 1);
    setSearch("");
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    const exactMatch = findExactIdentifierMatch(products, search);
    if (exactMatch) {
      handleSelectProduct(exactMatch);
      return;
    }
    const [onlyMatch] = products;
    if (products.length === 1 && onlyMatch) {
      handleSelectProduct(onlyMatch);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 p-4">
        <input
          ref={searchInputRef}
          type="search"
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Buscar por nombre, código de barras o SKU..."
          aria-label="Buscar productos"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 p-3">
        <button
          type="button"
          onClick={() => setFilter({ kind: "all" })}
          className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
            filter.kind === "all"
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-300 text-gray-700"
          }`}
        >
          Todas
        </button>
        {quickProducts.length > 0 && (
          <button
            type="button"
            onClick={() => setFilter({ kind: "quick" })}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
              filter.kind === "quick"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 text-gray-700"
            }`}
          >
            Rápidos
          </button>
        )}
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setFilter({ kind: "category", categoryId: category.id })}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
              filter.kind === "category" && filter.categoryId === category.id
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 text-gray-700"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
        {products.map((product) => (
          <ProductTile key={product.id} product={product} onSelect={handleSelectProduct} />
        ))}
        {products.length === 0 && (
          <p className="col-span-full text-sm text-gray-400">No se encontraron productos.</p>
        )}
      </div>
    </div>
  );
}
