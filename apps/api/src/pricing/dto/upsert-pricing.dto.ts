import { IsInt, IsOptional, Min } from "class-validator";

/**
 * A single call drives at most one change, matching D-007's four
 * synchronized-editing cases exactly (enforced in PricingService, not
 * here -- combinations that don't correspond to one of those four cases
 * are rejected there):
 * - `costPrice` alone -- a cost change; preserves the existing sale price.
 * - `costPrice` plus exactly one of {salePrice, profit,
 *   marginPercentBasisPoints} -- the first time pricing is set for a
 *   product (there is no prior sale price yet to preserve).
 * - Exactly one of {salePrice, profit, marginPercentBasisPoints} alone --
 *   the corresponding target-editing mode, applied against the existing
 *   cost price.
 *
 * Money fields (`costPrice`, `salePrice`) are integers in ARS minor units
 * (cents), never floats (D-005). `marginPercentBasisPoints` is Margin %
 * scaled by 100 (1% = 100 basis points; e.g. 33.33% is 3333) for the same
 * float-free, deterministic reason -- see @bmp/domain's pricing.ts.
 */
export class UpsertPricingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salePrice?: number;

  /** May be negative -- a deliberate below-cost sale price is representable, D-014's promotion-profitability policy is a separate, later concern. */
  @IsOptional()
  @IsInt()
  profit?: number;

  /** May be negative, symmetrically with `profit`. */
  @IsOptional()
  @IsInt()
  marginPercentBasisPoints?: number;
}
