/**
 * Trim + uppercase, uniformly for every identifier type. This deliberately
 * does not attempt barcode-format-specific normalization (e.g. EAN/UPC
 * leading-zero handling) -- no such format has been decided (DECISIONS.md
 * has no barcode-standard decision), and inventing one risks silently
 * treating two genuinely different codes as the same or vice versa.
 * "Normalised" here just means: no stray whitespace, consistent case.
 */
export function normalizeProductIdentifier(value: string): string {
  return value.trim().toUpperCase();
}
