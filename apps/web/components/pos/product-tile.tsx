"use client";

import { formatMoney } from "../../lib/catalog/money";
import type { CachedProduct } from "../../lib/pos-cache/types";

export interface ProductTileProps {
  product: CachedProduct;
  onSelect: (product: CachedProduct) => void;
}

/**
 * A visual shortcut, never a catalog requirement (SPECS.md 6.2/6.3): the
 * image is optional, and the tile itself is one of several ways into the
 * cart (search/scan work identically without ever rendering a tile).
 */
export function ProductTile({ product, onSelect }: ProductTileProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="flex flex-col items-start rounded border border-gray-200 p-3 text-left hover:border-gray-400"
    >
      {product.imageUrl ? (
        // Arbitrary external product image URLs; not worth Next/Image's
        // remote-pattern allowlist for an optional shortcut (SPECS.md 6.3).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt="" className="mb-2 h-16 w-16 rounded object-cover" />
      ) : (
        <div
          aria-hidden
          className="mb-2 flex h-16 w-16 items-center justify-center rounded bg-gray-100 text-xs text-gray-400"
        >
          {product.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium text-gray-900">{product.name}</span>
      <span className="text-sm text-gray-500">
        {product.salePrice === null
          ? "Sin precio"
          : product.saleMode === "weighted"
            ? `${formatMoney(product.salePrice)}/kg`
            : formatMoney(product.salePrice)}
      </span>
    </button>
  );
}
