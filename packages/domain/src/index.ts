// Pure business concepts and calculations (no framework or browser
// dependencies -- see ARCHITECTURE.md "domain"). Inventory and promotion
// logic are added in later phases; deterministic time/identity
// abstractions are established now (Phase 0) so that work has a testable
// foundation from day one.

export { type Clock, SystemClock } from "./clock";
export { type IdGenerator, Uuidv4Generator, Uuidv7Generator } from "./id-generator";
export {
  assertValidMoneyAmount,
  isValidMoneyAmount,
  type PricingInputMode,
  resolvePricing,
  type ResolvedPricing,
  salePriceForTargetMarginPercent,
  salePriceForTargetProfit,
} from "./pricing";
export {
  assertValidGramQuantity,
  formatGramsAsKilograms,
  GRAMS_PER_KILOGRAM,
  isValidGramQuantity,
  parseKilogramsToGrams,
  type WeightUnit,
} from "./weight";
