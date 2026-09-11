import { ArrayMaxSize, ArrayUnique, IsArray, IsString, MinLength } from "class-validator";

/**
 * SPECS.md 6.2 "quick access panel" / ROADMAP.md "add configurable quick
 * products": a business-curated, ordered set of product shortcuts for the
 * POS discovery panel (frequently sold items, cigarettes, ice, current
 * offers, ...). `productIds` is stored as plain product-ID references --
 * the same "no FK across a module boundary" convention already used for
 * AuditEvent.actorUserId/correlationId -- so this module never depends on
 * catalog's Product table. Resolving an ID to its current name/price/
 * image is entirely the reader's job (the POS cache, via
 * ProductsService.findManyByIds on the API side and the local Dexie cache
 * on the client side); an ID that no longer resolves (its product was
 * deleted, or -- defensively -- belongs to a different business) is
 * simply skipped there, never treated as configuration corruption. Order
 * in the array is display order.
 *
 * 60 is a deliberate, reasonable cap for a "quick access" grid meant to
 * stay glanceable on a POS screen, not a limit stated anywhere in
 * SPECS.md/DECISIONS.md -- cheap to raise later if a business needs more.
 */
export const QUICK_PRODUCTS_MAX_ITEMS = 60;

export class QuickProductsConfig {
  @IsArray()
  @ArrayMaxSize(QUICK_PRODUCTS_MAX_ITEMS)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  productIds!: string[];
}

export const QUICK_PRODUCTS_DEFAULT: QuickProductsConfig = {
  productIds: [],
};
