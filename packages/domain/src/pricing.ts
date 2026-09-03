// D-005/D-006/D-007/D-032: product pricing calculations. Money amounts
// (costPrice, salePrice, profit) are integers in the currency's minor
// unit (e.g. ARS cents) -- never JavaScript floats, never an unscaled
// decimal. Margin % is likewise never stored as a float or a plain
// decimal: it is expressed as an integer scaled by 100 ("basis points" --
// 1% = 100 basis points), so 33.33% is 3333. All arithmetic below is
// exact integer/BigInt math (multiply-then-divide-with-rounding, never a
// float division), matching the digit-exact spirit of weight.ts.

export type PricingInputMode = "sale_price" | "profit" | "margin_percent";

export interface ResolvedPricing {
  costPrice: number;
  salePrice: number;
  profit: number;
  /** null exactly when costPrice is 0 -- Margin % is mathematically undefined there (D-032). */
  marginPercentBasisPoints: number | null;
}

export function isValidMoneyAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function assertValidMoneyAmount(value: unknown, label: string): asserts value is number {
  if (!isValidMoneyAmount(value)) {
    throw new Error(
      `Invalid ${label}: ${String(value)}. Must be a non-negative integer (minor units).`,
    );
  }
}

/**
 * D-006: `marginPercent = ((salePrice - costPrice) / costPrice) * 100`.
 * `profit` is always exact integer subtraction, never rounded. Margin % is
 * rounded half-up to the nearest basis point using BigInt-exact
 * multiply-then-divide (never a float division). Returns null when
 * costPrice is 0 (D-032): profit is still well-defined, Margin % is not.
 */
export function resolvePricing(costPrice: number, salePrice: number): ResolvedPricing {
  assertValidMoneyAmount(costPrice, "costPrice");
  assertValidMoneyAmount(salePrice, "salePrice");

  const profit = salePrice - costPrice;
  const marginPercentBasisPoints =
    costPrice === 0 ? null : roundedIntegerMultiplyDivide(profit, 10000, costPrice);

  return { costPrice, salePrice, profit, marginPercentBasisPoints };
}

/**
 * D-007 target-profit editing mode: the sale price that yields exactly
 * `targetProfit` at the given cost. Exact (addition of two integers,
 * never rounded). The result may be an invalid (negative) money amount if
 * the target profit is a loss larger than the cost -- callers should
 * validate the result with `isValidMoneyAmount`/`assertValidMoneyAmount`
 * before persisting it, the same way any other salePrice is validated.
 */
export function salePriceForTargetProfit(costPrice: number, targetProfit: number): number {
  assertValidMoneyAmount(costPrice, "costPrice");
  if (!Number.isInteger(targetProfit)) {
    throw new Error(
      `Invalid target profit: ${String(targetProfit)}. Must be an integer (minor units).`,
    );
  }
  return costPrice + targetProfit;
}

/**
 * D-007 target-Margin-%-editing mode (inverse of the D-006 formula): the
 * sale price that yields (as close as integer minor units allow) the
 * given target Margin %, expressed in basis points. Rejected while
 * costPrice is 0 (D-032: Margin %-target mode must be disabled there).
 * The result is rounded half-up to the nearest whole minor unit -- the
 * Margin % re-derived from that rounded sale price via `resolvePricing`
 * may therefore differ from the requested target by a fraction of a
 * basis point. That is expected, deterministic rounding, not an
 * inconsistency: the persisted salePrice/profit/marginPercent must always
 * reconcile with each other exactly, never with the caller's original,
 * pre-rounding request.
 */
export function salePriceForTargetMarginPercent(
  costPrice: number,
  targetMarginPercentBasisPoints: number,
): number {
  assertValidMoneyAmount(costPrice, "costPrice");
  if (costPrice === 0) {
    throw new Error("Margin %-target pricing is undefined while costPrice is 0 (D-032).");
  }
  if (!Number.isInteger(targetMarginPercentBasisPoints)) {
    throw new Error(
      `Invalid target Margin % (basis points): ${String(targetMarginPercentBasisPoints)}. Must be an integer.`,
    );
  }
  const targetProfit = roundedIntegerMultiplyDivide(
    costPrice,
    targetMarginPercentBasisPoints,
    10000,
  );
  return costPrice + targetProfit;
}

/**
 * Computes `round(a * b / denominator)` using exact BigInt arithmetic
 * throughout (the multiplication never passes through a JS float), with
 * half-up rounding (ties round away from zero) applied to the final
 * division. `denominator` must be a positive integer.
 */
function roundedIntegerMultiplyDivide(a: number, b: number, denominator: number): number {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    !Number.isInteger(denominator) ||
    denominator <= 0
  ) {
    throw new Error(
      "roundedIntegerMultiplyDivide requires integer operands and a positive denominator.",
    );
  }

  const product = BigInt(a) * BigInt(b);
  const sign = product < 0n ? -1n : 1n;
  const absProduct = product < 0n ? -product : product;
  const d = BigInt(denominator);

  const quotient = absProduct / d;
  const remainder = absProduct % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  const result = sign * rounded;

  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("Pricing calculation exceeded the safe integer range.");
  }
  return Number(result);
}
