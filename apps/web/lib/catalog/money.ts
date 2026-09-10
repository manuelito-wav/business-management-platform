import { isValidMoneyAmount } from "@bmp/domain";

/**
 * Parses a decimal pesos string (e.g. "150.50" or the es-AR habit
 * "150,50") into integer ARS minor units/cents (D-005). Returns null for
 * anything that isn't a valid non-negative money amount, so callers (zod
 * refinements, form submit handlers) can reject it without duplicating the
 * validity rule -- `isValidMoneyAmount` is the one shared source of truth
 * for "what is a valid money amount" (@bmp/domain), not reimplemented here.
 */
export function parseMoneyToMinorUnits(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized.length === 0 || Number.isNaN(Number(normalized))) {
    return null;
  }
  const minorUnits = Math.round(Number(normalized) * 100);
  return isValidMoneyAmount(minorUnits) ? minorUnits : null;
}

/** Formats integer ARS minor units (D-005) back into a decimal string for a money input's default value, e.g. 15050 -> "150.50". */
export function formatMinorUnitsAsMoneyInput(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

/**
 * For use only after zod's moneyFieldSchema (lib/catalog/schemas.ts) has
 * already validated the string -- throws instead of silently coercing, so
 * a schema/parser mismatch fails loudly in development rather than
 * submitting a wrong amount.
 */
export function parseValidatedMoney(input: string): number {
  const parsed = parseMoneyToMinorUnits(input);
  if (parsed === null) {
    throw new Error(`Invalid money value reached a submit handler after validation: "${input}".`);
  }
  return parsed;
}

/**
 * Formats integer ARS minor units (D-005) as a localized currency string
 * for read-only display, e.g. 15050 -> "$150,50". Currency scope beyond
 * ARS is a pending decision (DECISIONS.md); the MVP operates in ARS only,
 * and this formatter is not relied on anywhere that would need to change
 * for a future configurable currency.
 */
const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
export function formatMoney(minorUnits: number): string {
  return currencyFormatter.format(minorUnits / 100);
}
