// The local POS reference cache's own, deliberately trimmed shapes
// (CODESTYLE.md "Cache only explicitly required scoped operational
// data" / "Do not treat browser storage as a full database replica").
// These are NOT the same as apps/api's response shapes -- see the
// Remote* types below for the (also partial) subset of each API
// response this module actually reads. Cost/profit/Margin % are
// deliberately never cached: only `salePrice`, the one figure the POS
// needs to charge a customer.

export type ProductSaleMode = "unit" | "weighted";
export type WeightUnit = "g" | "kg";
export type EntityStatus = "active" | "inactive";
export type ProductIdentifierType = "barcode" | "sku" | "external";

export interface CachedProductIdentifier {
  type: ProductIdentifierType;
  normalizedValue: string;
}

export interface CachedProduct {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  saleMode: ProductSaleMode;
  weightUnit: WeightUnit | null;
  imageUrl: string | null;
  status: EntityStatus;
  /** Integer ARS minor units (D-005), or null when pricing has not been set for this product yet. */
  salePrice: number | null;
  /** For offline scan/search lookup (SPECS.md 6.2). */
  identifiers: CachedProductIdentifier[];
}

export interface CachedCategory {
  id: string;
  businessId: string;
  name: string;
  status: EntityStatus;
}

/**
 * The business's operational configuration, cached whole -- most section
 * contents are opaque `Record`s here (no UI reads them yet); the
 * business's own config module (apps/api/src/configuration) remains the
 * single source of truth for each section's real shape. `quickProducts`
 * is the one section the POS discovery panel actually reads offline
 * (ROADMAP.md "add configurable quick products"), so it gets a real type
 * here instead of staying opaque.
 */
export interface CachedPosConfiguration {
  businessId: string;
  businessTimezone: string;
  paymentMethods: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
  policies: Record<string, unknown>;
  registerPolicy: Record<string, unknown>;
  quickProducts: { productIds: string[] };
}

/**
 * A local, in-progress POS sale line/tab snapshot (ROADMAP.md "add
 * multi-tab POS drafts": "lightweight strategic local draft recovery
 * using the Phase 2 store"). Lower-durability by design --
 * ARCHITECTURE.md's Offline section reserves the full durable outbox for
 * FINALIZED operations to a later Phase 6 checkpoint ("drafts remain
 * lower-durability by design"); this only needs to survive an accidental
 * page refresh or crash, not guarantee delivery. Structurally
 * independent from lib/pos/cart.ts's own CartLine/SaleTab -- same
 * "deliberately trimmed, not the same as" boundary this file already
 * draws between CachedProduct and the API's Product -- even though the
 * shapes happen to match today: pos-cache is a lower-level module and
 * must never import from a higher-level POS module.
 */
export interface CachedDraftLine {
  productId: string;
  name: string;
  saleMode: ProductSaleMode;
  weightUnit: WeightUnit | null;
  unitPrice: number | null;
  quantity: number;
  imageUrl: string | null;
}

export interface CachedDraftTab {
  id: string;
  label: string;
  lines: CachedDraftLine[];
}

export interface CachedPosDraft {
  businessId: string;
  tabs: CachedDraftTab[];
  activeTabId: string;
  savedAt: Date;
}

// -- The (partial) API response shapes this module reads off the wire --

export interface RemoteProductIdentifier {
  type: ProductIdentifierType;
  normalizedValue: string;
}

export interface RemoteProduct {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  saleMode: ProductSaleMode;
  weightUnit: WeightUnit | null;
  imageUrl: string | null;
  status: EntityStatus;
  identifiers: RemoteProductIdentifier[];
  pricing: { salePrice: number } | null;
}

export interface RemoteProductPage {
  data: RemoteProduct[];
  pagination: { nextCursor: string | null };
}

export interface RemoteCategory {
  id: string;
  businessId: string;
  name: string;
  status: EntityStatus;
}

export interface RemoteConfiguration {
  businessTimezone: string;
  paymentMethods: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
  policies: Record<string, unknown>;
  registerPolicy: Record<string, unknown>;
  quickProducts: { productIds: string[] };
}
