"use client";

import { useState } from "react";
import { useBusiness } from "../../lib/business/business-context";
import { formatMoney } from "../../lib/catalog/money";
import { useCategories, useProducts } from "../../lib/catalog/queries";
import type { Product } from "../../lib/catalog/types";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { PricingDialog } from "./pricing-dialog";
import { ProductFormDialog } from "./product-form-dialog";
import { QuickProductsManagerDialog } from "./quick-products-manager-dialog";

export interface ProductsScreenProps {
  businessId: string;
  initialOpenCreate?: boolean;
}

/** Product management screen (ROADMAP.md "add operational navigation and catalog screens"). */
export function ProductsScreen({ businessId, initialOpenCreate = false }: ProductsScreenProps) {
  const { hasPermission } = useBusiness();
  const canManageCatalog = hasPermission("catalog.manage");
  const canManagePricing = hasPermission("pricing.manage");
  const canManageConfiguration = hasPermission("configuration.manage");

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // A stack of visited cursors: [null, cursorAfterPage1, cursorAfterPage2, ...].
  // The API (D-041) only hands back a *next* cursor, so "Anterior" pops the
  // stack back to a cursor we already visited rather than asking the
  // server for a previous page it does not expose.
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const { data: categories } = useCategories(businessId);
  const {
    data: page,
    isPending,
    isError,
  } = useProducts(
    businessId,
    { search: search || undefined, categoryId: categoryId || undefined },
    cursor,
  );

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [quickProductsDialogOpen, setQuickProductsDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(initialOpenCreate);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);

  const resetPagination = () => setCursorStack([null]);

  const openCreateProduct = () => {
    setEditingProduct(undefined);
    setProductDialogOpen(true);
  };
  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductDialogOpen(true);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Productos</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCategoryDialogOpen(true)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            Categorías
          </button>
          <button
            type="button"
            onClick={() => setQuickProductsDialogOpen(true)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            Accesos rápidos
          </button>
          {canManageCatalog && (
            <button
              type="button"
              onClick={openCreateProduct}
              className="bg-accent text-accent-foreground rounded px-3 py-2 text-sm font-medium"
            >
              Nuevo producto
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPagination();
          }}
          placeholder="Buscar por nombre, código de barras o SKU..."
          aria-label="Buscar productos"
          className="w-72 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            resetPagination();
          }}
          aria-label="Filtrar por categoría"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {isPending && <p className="mt-6 text-sm text-gray-500">Cargando...</p>}
      {isError && <p className="mt-6 text-sm text-red-600">No se pudieron cargar los productos.</p>}

      {page && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Categoría</th>
                <th className="py-2 pr-4 font-medium">Modo</th>
                <th className="py-2 pr-4 font-medium">Precio</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 font-medium" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {page.data.map((product) => {
                const category = categories?.find((item) => item.id === product.categoryId);
                return (
                  <tr key={product.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{product.name}</td>
                    <td className="py-2 pr-4">{category?.name ?? "--"}</td>
                    <td className="py-2 pr-4">
                      {product.saleMode === "unit" ? "Unidad" : `Peso (${product.weightUnit})`}
                    </td>
                    <td className="py-2 pr-4">
                      {product.pricing ? formatMoney(product.pricing.salePrice) : "Sin precio"}
                    </td>
                    <td className="py-2 pr-4">
                      {product.status === "active" ? "Activo" : "Inactivo"}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {canManageCatalog && (
                        <button
                          type="button"
                          onClick={() => openEditProduct(product)}
                          className="mr-3 underline"
                        >
                          Editar
                        </button>
                      )}
                      {canManagePricing && (
                        <button
                          type="button"
                          onClick={() => setPricingProduct(product)}
                          className="underline"
                        >
                          Precio
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {page.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">
                    No se encontraron productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={cursorStack.length <= 1}
              onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={!page.pagination.nextCursor}
              onClick={() => setCursorStack((stack) => [...stack, page.pagination.nextCursor])}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <CategoryManagerDialog
        businessId={businessId}
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        canManage={canManageCatalog}
      />
      <QuickProductsManagerDialog
        businessId={businessId}
        open={quickProductsDialogOpen}
        onClose={() => setQuickProductsDialogOpen(false)}
        canManage={canManageConfiguration}
      />
      <ProductFormDialog
        businessId={businessId}
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        product={editingProduct}
      />
      {pricingProduct && (
        <PricingDialog
          businessId={businessId}
          open
          onClose={() => setPricingProduct(null)}
          product={pricingProduct}
        />
      )}
    </div>
  );
}
