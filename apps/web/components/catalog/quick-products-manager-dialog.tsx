"use client";

import { useState } from "react";
import { useProducts, useProductsByIds } from "../../lib/catalog/queries";
import type { Product } from "../../lib/catalog/types";
import { useConfiguration, useUpdateQuickProducts } from "../../lib/configuration/queries";
import { Dialog } from "../ui/dialog";

export interface QuickProductsManagerDialogProps {
  businessId: string;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
}

/**
 * Configures the POS discovery panel's "Rapidos" shortcut list (ROADMAP.md
 * "add configurable quick products") -- same dialog-launched-from-the-
 * products-screen pattern as CategoryManagerDialog, and the same
 * immediate-mutation UX (no separate "Save" step: every add/remove/
 * reorder click persists right away).
 *
 * There is no client-side cap on how many products may be added: the
 * API's QuickProductsConfig section already enforces one (see that
 * file's doc comment for why), and duplicating that number here would
 * only risk the two limits drifting apart. A rejected add simply surfaces
 * the mutation's own error instead.
 */
export function QuickProductsManagerDialog({
  businessId,
  open,
  onClose,
  canManage,
}: QuickProductsManagerDialogProps) {
  const { data: configuration } = useConfiguration(businessId);
  const productIds = configuration?.quickProducts.productIds ?? [];
  const updateQuickProducts = useUpdateQuickProducts(businessId);

  // Resolved product records may arrive in any order (parallel requests);
  // re-derive display order from productIds itself, the source of truth.
  const resolvedSelected = useProductsByIds(businessId, productIds);
  const orderedSelected = productIds
    .map((id) => resolvedSelected.find((product) => product.id === id))
    .filter((product): product is Product => product !== undefined);

  const [search, setSearch] = useState("");
  const { data: searchPage } = useProducts(businessId, { search: search || undefined }, null);
  const searchResults = searchPage?.data ?? [];

  const save = (nextProductIds: string[]) => updateQuickProducts.mutate(nextProductIds);

  const add = (productId: string) => {
    if (productIds.includes(productId)) {
      return;
    }
    save([...productIds, productId]);
  };
  const remove = (productId: string) => save(productIds.filter((id) => id !== productId));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= productIds.length) {
      return;
    }
    const next = [...productIds];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(target, 0, moved);
    save(next);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Accesos rápidos">
      <p className="mb-3 text-sm text-gray-500">
        Elegí qué productos aparecen como accesos rápidos en el punto de venta y en qué orden.
      </p>

      {updateQuickProducts.isError && (
        <p className="mb-3 text-sm text-red-600">
          No se pudo guardar el cambio. Puede que hayas alcanzado el máximo permitido de accesos
          rápidos.
        </p>
      )}

      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {orderedSelected.map((product, index) => (
          <li
            key={product.id}
            className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
          >
            <span className="text-gray-900">{product.name}</span>
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Subir ${product.name}`}
                  className="text-xs text-gray-500 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === orderedSelected.length - 1}
                  aria-label={`Bajar ${product.name}`}
                  className="text-xs text-gray-500 disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => remove(product.id)}
                  className="text-xs text-red-600 underline"
                >
                  Quitar
                </button>
              </div>
            )}
          </li>
        ))}
        {productIds.length === 0 && (
          <li className="text-sm text-gray-500">Todavía no hay accesos rápidos configurados.</li>
        )}
      </ul>

      {canManage && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <label htmlFor="quick-product-search" className="block text-sm font-medium text-gray-700">
            Agregar producto
          </label>
          <input
            id="quick-product-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, código de barras o SKU..."
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {searchResults.map((product) => {
              const alreadyAdded = productIds.includes(product.id);
              return (
                <li
                  key={product.id}
                  className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
                >
                  <span className="text-gray-900">{product.name}</span>
                  <button
                    type="button"
                    onClick={() => add(product.id)}
                    disabled={alreadyAdded}
                    className="text-xs text-gray-500 underline disabled:opacity-30"
                  >
                    {alreadyAdded ? "Agregado" : "Agregar"}
                  </button>
                </li>
              );
            })}
            {search && searchResults.length === 0 && (
              <li className="text-sm text-gray-500">Sin resultados.</li>
            )}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
