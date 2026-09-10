// Wire shapes returned by apps/api/src/catalog and apps/api/src/pricing --
// the full admin shapes (unlike lib/pos-cache/types.ts's deliberately
// trimmed, salePrice-only cache shapes).

export type ProductSaleMode = "unit" | "weighted";
export type ProductWeightUnit = "g" | "kg";
export type ProductStatus = "active" | "inactive";
export type CategoryStatus = "active" | "inactive";
export type ProductIdentifierType = "barcode" | "sku" | "external";
export type PricingInputMode = "sale_price" | "profit" | "margin_percent";

export interface Category {
  id: string;
  businessId: string;
  name: string;
  status: CategoryStatus;
}

export interface ProductIdentifier {
  id: string;
  type: ProductIdentifierType;
  value: string;
  normalizedValue: string;
}

export interface ProductPricing {
  costPrice: number;
  salePrice: number;
  profit: number;
  marginPercentBasisPoints: number | null;
  inputMode: PricingInputMode;
}

export interface Product {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  description: string | null;
  saleMode: ProductSaleMode;
  weightUnit: ProductWeightUnit | null;
  imageUrl: string | null;
  status: ProductStatus;
  identifiers: ProductIdentifier[];
  pricing: ProductPricing | null;
}

export interface ProductPage {
  data: Product[];
  pagination: { nextCursor: string | null };
}

export interface CreateProductInput {
  name: string;
  categoryId: string;
  description?: string;
  saleMode?: ProductSaleMode;
  weightUnit?: ProductWeightUnit;
  imageUrl?: string;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string;
  description?: string;
  saleMode?: ProductSaleMode;
  weightUnit?: ProductWeightUnit;
  imageUrl?: string;
  status?: ProductStatus;
}

export interface UpsertPricingInput {
  costPrice?: number;
  salePrice?: number;
}
