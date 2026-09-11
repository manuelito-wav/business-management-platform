import { GRAMS_PER_KILOGRAM, roundedIntegerMultiplyDivide } from "@bmp/domain";
import type { CartLine } from "./cart";

/**
 * A line's total in integer ARS minor units (D-005), or null when the
 * product has no price set yet (CachedProduct.salePrice null -- never
 * silently treated as free). Business calculations stay out of
 * components (CODESTYLE.md): this is the one place cart math happens.
 */
export function computeLineTotal(line: CartLine): number | null {
  if (line.unitPrice === null) {
    return null;
  }
  if (line.saleMode === "unit") {
    // Both operands are already integers (D-005/D-008) -- an exact
    // integer product, no rounding needed.
    return line.unitPrice * line.quantity;
  }
  // Weighted: unitPrice is ARS-per-kilogram (see cart.ts's CartLine doc
  // comment), quantity is integer grams -- roundedIntegerMultiplyDivide
  // does the exact-integer proportional math (D-005), never a float
  // division.
  return roundedIntegerMultiplyDivide(line.unitPrice, line.quantity, GRAMS_PER_KILOGRAM);
}

/** Sum of every line's total; a line with no price yet contributes nothing (its own missing-price state is surfaced separately in the UI). */
export function computeCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + (computeLineTotal(line) ?? 0), 0);
}
