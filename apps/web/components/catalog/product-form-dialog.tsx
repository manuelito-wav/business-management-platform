"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { isApiError } from "../../lib/api/error";
import {
  useAddProductIdentifier,
  useCategories,
  useCreateProduct,
  useRemoveProductIdentifier,
  useUpdateProduct,
} from "../../lib/catalog/queries";
import { productFormSchema, type ProductFormValues } from "../../lib/catalog/schemas";
import type { Product, ProductIdentifierType } from "../../lib/catalog/types";
import { Dialog } from "../ui/dialog";

export interface ProductFormDialogProps {
  businessId: string;
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing product; absent when creating one. */
  product?: Product;
}

const IDENTIFIER_TYPES: { value: ProductIdentifierType; label: string }[] = [
  { value: "barcode", label: "Código de barras" },
  { value: "sku", label: "SKU" },
  { value: "external", label: "Otro" },
];

const EMPTY_VALUES: ProductFormValues = {
  name: "",
  categoryId: "",
  saleMode: "unit",
  weightUnit: "",
  imageUrl: "",
};

export function ProductFormDialog({ businessId, open, onClose, product }: ProductFormDialogProps) {
  const { data: categories } = useCategories(businessId);
  const createProduct = useCreateProduct(businessId);
  const updateProduct = useUpdateProduct(businessId);
  const addIdentifier = useAddProductIdentifier(businessId);
  const removeIdentifier = useRemoveProductIdentifier(businessId);
  const [formError, setFormError] = useState<string | null>(null);
  const [newIdentifierType, setNewIdentifierType] = useState<ProductIdentifierType>("barcode");
  const [newIdentifierValue, setNewIdentifierValue] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    setFormError(null);
    reset(
      product
        ? {
            name: product.name,
            categoryId: product.categoryId,
            saleMode: product.saleMode,
            weightUnit: product.weightUnit ?? "",
            imageUrl: product.imageUrl ?? "",
          }
        : EMPTY_VALUES,
    );
  }, [open, product, reset]);

  const saleMode = watch("saleMode");

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const input = {
      name: values.name,
      categoryId: values.categoryId,
      saleMode: values.saleMode,
      weightUnit: values.saleMode === "weighted" ? values.weightUnit || undefined : undefined,
      imageUrl: values.imageUrl || undefined,
    };
    try {
      if (product) {
        await updateProduct.mutateAsync({ productId: product.id, ...input });
      } else {
        await createProduct.mutateAsync(input);
      }
      onClose();
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "No se pudo guardar el producto.");
    }
  });

  const onAddIdentifier = async () => {
    if (!product || newIdentifierValue.trim().length === 0) {
      return;
    }
    try {
      await addIdentifier.mutateAsync({
        productId: product.id,
        type: newIdentifierType,
        value: newIdentifierValue.trim(),
      });
      setNewIdentifierValue("");
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "No se pudo agregar el identificador.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={product ? "Editar producto" : "Nuevo producto"}>
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <div>
          <label htmlFor="product-name" className="block text-sm font-medium text-gray-700">
            Nombre
          </label>
          <input
            id="product-name"
            type="text"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            {...register("name")}
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="product-category" className="block text-sm font-medium text-gray-700">
            Categoría
          </label>
          <select
            id="product-category"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            {...register("categoryId")}
          >
            <option value="">Elegí una categoría</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="mt-1 text-sm text-red-600">{errors.categoryId.message}</p>
          )}
        </div>

        <div className="flex gap-3">
          <div>
            <label htmlFor="product-sale-mode" className="block text-sm font-medium text-gray-700">
              Modo de venta
            </label>
            <select
              id="product-sale-mode"
              className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
              {...register("saleMode")}
            >
              <option value="unit">Por unidad</option>
              <option value="weighted">Por peso</option>
            </select>
          </div>
          {saleMode === "weighted" && (
            <div>
              <label
                htmlFor="product-weight-unit"
                className="block text-sm font-medium text-gray-700"
              >
                Unidad
              </label>
              <select
                id="product-weight-unit"
                className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
                {...register("weightUnit")}
              >
                <option value="">--</option>
                <option value="g">Gramos</option>
                <option value="kg">Kilogramos</option>
              </select>
              {errors.weightUnit && (
                <p className="mt-1 text-sm text-red-600">{errors.weightUnit.message}</p>
              )}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="product-image-url" className="block text-sm font-medium text-gray-700">
            Imagen (opcional)
          </label>
          <input
            id="product-image-url"
            type="text"
            placeholder="https://..."
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            {...register("imageUrl")}
          />
          {errors.imageUrl && (
            <p className="mt-1 text-sm text-red-600">{errors.imageUrl.message}</p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-accent text-accent-foreground w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {product ? "Guardar cambios" : "Crear producto"}
        </button>
      </form>

      {product && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-900">Identificadores</h3>
          <ul className="mt-2 space-y-1">
            {product.identifiers.map((identifier) => (
              <li key={identifier.id} className="flex items-center justify-between text-sm">
                <span>
                  {IDENTIFIER_TYPES.find((type) => type.value === identifier.type)?.label ??
                    identifier.type}
                  : {identifier.value}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    removeIdentifier.mutate({ productId: product.id, identifierId: identifier.id })
                  }
                  className="text-xs text-red-600 underline"
                >
                  Quitar
                </button>
              </li>
            ))}
            {product.identifiers.length === 0 && (
              <li className="text-sm text-gray-500">Sin identificadores.</li>
            )}
          </ul>
          <div className="mt-2 flex gap-2">
            <label className="sr-only" htmlFor="new-identifier-type">
              Tipo de identificador
            </label>
            <select
              id="new-identifier-type"
              value={newIdentifierType}
              onChange={(event) =>
                setNewIdentifierType(event.target.value as ProductIdentifierType)
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {IDENTIFIER_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="new-identifier-value">
              Valor del identificador
            </label>
            <input
              id="new-identifier-value"
              type="text"
              value={newIdentifierValue}
              onChange={(event) => setNewIdentifierValue(event.target.value)}
              placeholder="Valor"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => void onAddIdentifier()}
              className="rounded border border-gray-300 px-3 py-1 text-sm"
            >
              Agregar
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
