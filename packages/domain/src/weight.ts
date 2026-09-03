/**
 * Weighted-quantity conversion and validation (D-008): the integer gram is
 * the sole authoritative internal unit for weighted products. Kilograms
 * are only ever an input/display convention -- 1 kg = 1000 g exactly, and
 * conversions are explicit and deterministic. Operational quantities never
 * use floating-point values: `parseKilogramsToGrams` works on the decimal
 * string digit-by-digit (never `Number(kg) * 1000`), because a plain
 * float multiplication is not guaranteed exact for arbitrary 3-decimal
 * inputs (`0.1` itself has no exact binary floating-point representation).
 */

export type WeightUnit = "g" | "kg";

export const GRAMS_PER_KILOGRAM = 1000;

const KILOGRAM_INPUT_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/;

/**
 * Parses a decimal kilogram string (at most 3 fractional digits, since a
 * gram is already the finest authoritative unit) into a whole number of
 * grams. Throws on a negative value, a non-numeric value, or more than 3
 * fractional digits (which would imply a fractional gram).
 */
export function parseKilogramsToGrams(input: string): number {
  const trimmed = input.trim();
  const match = KILOGRAM_INPUT_PATTERN.exec(trimmed);
  const wholePart = match?.[1];
  if (!match || wholePart === undefined) {
    throw new Error(
      `Invalid kilogram quantity: "${input}". Expected a non-negative decimal with at most 3 fractional digits.`,
    );
  }
  const fractionalPart = (match[2] ?? "").padEnd(3, "0");
  return Number(`${wholePart}${fractionalPart}`);
}

/** Formats an integer gram quantity as a kilogram decimal string (e.g. 2005 -> "2.005"). */
export function formatGramsAsKilograms(grams: number): string {
  assertValidGramQuantity(grams);
  const whole = Math.floor(grams / GRAMS_PER_KILOGRAM);
  const remainder = grams % GRAMS_PER_KILOGRAM;
  return `${whole}.${String(remainder).padStart(3, "0")}`;
}

export function isValidGramQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function assertValidGramQuantity(value: unknown): asserts value is number {
  if (!isValidGramQuantity(value)) {
    throw new Error(`Invalid gram quantity: ${String(value)}. Must be a non-negative integer.`);
  }
}
