"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useCartStore } from "../../lib/pos/cart";
import {
  findExactIdentifierMatch,
  useCachedCategories,
  useCachedProducts,
} from "../../lib/pos/pos-catalog";
import type { CachedProduct } from "../../lib/pos-cache/types";
import { ProductTile } from "./product-tile";

export interface PosDiscoveryProps {
  businessId: string;
}

/**
 * SPECS.md 6.2's "Right Section: Product Discovery" -- keyboard-first
 * search (name/barcode/SKU), category browsing, and the full catalog
 * remains searchable beyond whatever category is selected. Configurable
 * "Quick Products / Rapidos" shortcuts are ROADMAP.md's next checkpoint,
 * not this one -- category browsing already covers "selected visual
 * product groups" (SPECS.md 6.2) in the meantime.
 */
export function PosDiscovery({ businessId }: PosDiscoveryProps) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addProduct = useCartStore((state) => state.addProduct);

  const categories = useCachedCategories(businessId);
  const products = useCachedProducts(businessId, { search, categoryId: categoryId ?? undefined });

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
          onClick={() => setCategoryId(null)}
          className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
            categoryId === null
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-300 text-gray-700"
          }`}
        >
          Todas
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
              categoryId === category.id
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
