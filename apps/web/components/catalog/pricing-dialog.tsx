"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { isApiError } from "../../lib/api/error";
import { useUpsertPricing } from "../../lib/catalog/queries";
import {
  formatMinorUnitsAsMoneyInput,
  formatMoney,
  parseValidatedMoney,
} from "../../lib/catalog/money";
import {
  costOnlyFormSchema,
  pricingFormSchema,
  salePriceOnlyFormSchema,
  type CostOnlyFormValues,
  type PricingFormValues,
  type SalePriceOnlyFormValues,
} from "../../lib/catalog/schemas";
import type { Product } from "../../lib/catalog/types";
import { Dialog } from "../ui/dialog";

export interface PricingDialogProps {
  businessId: string;
  open: boolean;
  onClose: () => void;
  product: Product;
}

type EditTarget = "cost" | "salePrice";

/**
 * Deliberately narrower than the backend: PricingService/UpsertPricingDto
 * support four editing shapes (D-007) -- cost-only, and exactly one of
 * salePrice/profit/marginPercent -- but this checkpoint's UI exposes only
 * the cost and sale-price-driven modes (the two most direct "what do I
 * charge" actions). Profit-target and Margin-%-target editing are visible
 * here only as the read-only computed values; adding UI for them is a
 * proportionate follow-up once there is real usage feedback, not something
 * this first catalog-screens checkpoint needs to front-load.
 */
export function PricingDialog({ businessId, open, onClose, product }: PricingDialogProps) {
  const upsertPricing = useUpsertPricing(businessId);
  const [formError, setFormError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>("cost");
  const hasPricing = product.pricing !== null;

  // No reset-on-prop-change effect needed: products-screen.tsx only ever
  // renders this dialog via `{pricingProduct && <PricingDialog ... />}`,
  // so a fresh instance (and fresh form state) mounts every time it opens
  // or targets a different product -- these are simply each form's
  // mount-time default values, not state synchronized from a later prop
  // change.
  const initialForm = useForm<PricingFormValues>({
    resolver: zodResolver(pricingFormSchema),
    defaultValues: { costPrice: "", salePrice: "" },
  });
  const costForm = useForm<CostOnlyFormValues>({
    resolver: zodResolver(costOnlyFormSchema),
    defaultValues: {
      costPrice: product.pricing ? formatMinorUnitsAsMoneyInput(product.pricing.costPrice) : "",
    },
  });
  const salePriceForm = useForm<SalePriceOnlyFormValues>({
    resolver: zodResolver(salePriceOnlyFormSchema),
    defaultValues: {
      salePrice: product.pricing ? formatMinorUnitsAsMoneyInput(product.pricing.salePrice) : "",
    },
  });

  const onSubmitInitial = initialForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await upsertPricing.mutateAsync({
        productId: product.id,
        costPrice: parseValidatedMoney(values.costPrice),
        salePrice: parseValidatedMoney(values.salePrice),
      });
      onClose();
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "No se pudo guardar el precio.");
    }
  });

  const onSubmitCost = costForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await upsertPricing.mutateAsync({
        productId: product.id,
        costPrice: parseValidatedMoney(values.costPrice),
      });
      onClose();
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "No se pudo guardar el costo.");
    }
  });

  const onSubmitSalePrice = salePriceForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await upsertPricing.mutateAsync({
        productId: product.id,
        salePrice: parseValidatedMoney(values.salePrice),
      });
      onClose();
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "No se pudo guardar el precio de venta.");
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={`Precio -- ${product.name}`}>
      {product.pricing && (
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Costo</dt>
          <dd className="text-gray-900">{formatMoney(product.pricing.costPrice)}</dd>
          <dt className="text-gray-500">Precio de venta</dt>
          <dd className="text-gray-900">{formatMoney(product.pricing.salePrice)}</dd>
          <dt className="text-gray-500">Ganancia</dt>
          <dd className="text-gray-900">{formatMoney(product.pricing.profit)}</dd>
          <dt className="text-gray-500">Margen %</dt>
          <dd className="text-gray-900">
            {product.pricing.marginPercentBasisPoints === null
              ? "--"
              : `${(product.pricing.marginPercentBasisPoints / 100).toFixed(2)}%`}
          </dd>
        </dl>
      )}

      {!hasPricing && (
        <form onSubmit={onSubmitInitial} noValidate className="space-y-3">
          <div>
            <label htmlFor="initial-cost-price" className="block text-sm font-medium text-gray-700">
              Costo
            </label>
            <input
              id="initial-cost-price"
              type="text"
              inputMode="decimal"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              {...initialForm.register("costPrice")}
            />
            {initialForm.formState.errors.costPrice && (
              <p className="mt-1 text-sm text-red-600">
                {initialForm.formState.errors.costPrice.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="initial-sale-price" className="block text-sm font-medium text-gray-700">
              Precio de venta
            </label>
            <input
              id="initial-sale-price"
              type="text"
              inputMode="decimal"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              {...initialForm.register("salePrice")}
            />
            {initialForm.formState.errors.salePrice && (
              <p className="mt-1 text-sm text-red-600">
                {initialForm.formState.errors.salePrice.message}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={initialForm.formState.isSubmitting}
            className="bg-accent text-accent-foreground w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Guardar precio
          </button>
        </form>
      )}

      {hasPricing && (
        <div>
          <div className="mb-3 flex gap-4 text-sm">
            <button
              type="button"
              onClick={() => setEditTarget("cost")}
              className={
                editTarget === "cost" ? "font-semibold text-gray-900 underline" : "text-gray-500"
              }
            >
              Editar costo
            </button>
            <button
              type="button"
              onClick={() => setEditTarget("salePrice")}
              className={
                editTarget === "salePrice"
                  ? "font-semibold text-gray-900 underline"
                  : "text-gray-500"
              }
            >
              Editar precio de venta
            </button>
          </div>

          {editTarget === "cost" && (
            <form onSubmit={onSubmitCost} noValidate className="space-y-3">
              <p className="text-xs text-gray-500">
                Cambiar el costo mantiene el precio de venta actual (recalcula ganancia y margen).
              </p>
              <div>
                <label
                  htmlFor="cost-only-price"
                  className="block text-sm font-medium text-gray-700"
                >
                  Costo
                </label>
                <input
                  id="cost-only-price"
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  {...costForm.register("costPrice")}
                />
                {costForm.formState.errors.costPrice && (
                  <p className="mt-1 text-sm text-red-600">
                    {costForm.formState.errors.costPrice.message}
                  </p>
                )}
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                disabled={costForm.formState.isSubmitting}
                className="bg-accent text-accent-foreground w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Guardar costo
              </button>
            </form>
          )}

          {editTarget === "salePrice" && (
            <form onSubmit={onSubmitSalePrice} noValidate className="space-y-3">
              <div>
                <label
                  htmlFor="sale-price-only"
                  className="block text-sm font-medium text-gray-700"
                >
                  Precio de venta
                </label>
                <input
                  id="sale-price-only"
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  {...salePriceForm.register("salePrice")}
                />
                {salePriceForm.formState.errors.salePrice && (
                  <p className="mt-1 text-sm text-red-600">
                    {salePriceForm.formState.errors.salePrice.message}
                  </p>
                )}
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                disabled={salePriceForm.formState.isSubmitting}
                className="bg-accent text-accent-foreground w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Guardar precio de venta
              </button>
            </form>
          )}
        </div>
      )}
    </Dialog>
  );
}
