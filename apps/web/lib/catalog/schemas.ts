import { z } from "zod";
import { parseMoneyToMinorUnits } from "./money";

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

/**
 * Mirrors CreateProductDto/UpdateProductDto's own rule (D-008): weightUnit
 * is required exactly when saleMode is "weighted", forbidden otherwise.
 */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio."),
    categoryId: z.string().min(1, "Elegí una categoría."),
    saleMode: z.enum(["unit", "weighted"]),
    weightUnit: z.union([z.enum(["g", "kg"]), z.literal("")]).optional(),
    imageUrl: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidUrl(value), "La URL de la imagen no es válida.")
      .optional(),
  })
  .refine((value) => value.saleMode !== "weighted" || !!value.weightUnit, {
    message: "Elegí una unidad de peso.",
    path: ["weightUnit"],
  });
export type ProductFormValues = z.infer<typeof productFormSchema>;

const moneyFieldSchema = z
  .string()
  .trim()
  .min(1, "Obligatorio.")
  .refine(
    (value) => parseMoneyToMinorUnits(value) !== null,
    "Ingresá un monto válido (0 o mayor).",
  );

/** First-time pricing (PricingService.applyCreate): costPrice + salePrice together. */
export const pricingFormSchema = z.object({
  costPrice: moneyFieldSchema,
  salePrice: moneyFieldSchema,
});
export type PricingFormValues = z.infer<typeof pricingFormSchema>;

/** Cost-only update (PricingService.applyUpdate's cost branch) -- preserves the existing sale price. */
export const costOnlyFormSchema = z.object({ costPrice: moneyFieldSchema });
export type CostOnlyFormValues = z.infer<typeof costOnlyFormSchema>;

/** Sale-price-only update (PricingService.applyUpdate's driver branch, "sale_price" mode). */
export const salePriceOnlyFormSchema = z.object({ salePrice: moneyFieldSchema });
export type SalePriceOnlyFormValues = z.infer<typeof salePriceOnlyFormSchema>;
