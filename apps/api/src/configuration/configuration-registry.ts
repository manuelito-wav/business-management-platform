import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { FEATURE_FLAGS_DEFAULT, FeatureFlagsConfig } from "./sections/feature-flags.config";
import { PAYMENT_METHODS_DEFAULT, PaymentMethodsConfig } from "./sections/payment-methods.config";
import { POLICIES_DEFAULT, PoliciesConfig } from "./sections/policies.config";

export type ConfigurationKey = "paymentMethods" | "featureFlags" | "policies";
export const CONFIGURATION_KEYS: readonly ConfigurationKey[] = [
  "paymentMethods",
  "featureFlags",
  "policies",
];

export interface ConfigurationSectionDefinition<T extends object> {
  defaultValue: T;
  /**
   * Re-validates a value already persisted for this key. Falls back to
   * the safe default rather than throwing, so a stored value that no
   * longer matches its section's current shape (schema evolution over
   * time) never breaks a read of the rest of a business's configuration.
   */
  sanitize(storedValue: unknown): T;
}

function definePlainSection<T extends object>(
  sectionClass: new () => T,
  defaultValue: T,
): ConfigurationSectionDefinition<T> {
  return {
    defaultValue,
    sanitize(storedValue: unknown): T {
      // Merged over the default before validating: a section gaining a
      // new field in a later checkpoint (e.g. featureFlags.productImages)
      // must not make every business's already-stored, still-otherwise-
      // valid value for that section look "corrupt" and reset entirely --
      // only a field that is actually invalid after the merge falls back
      // to the full default.
      const merged =
        storedValue && typeof storedValue === "object"
          ? { ...defaultValue, ...storedValue }
          : defaultValue;
      const instance = plainToInstance(sectionClass, merged);
      const errors = validateSync(instance as object);
      return errors.length === 0 ? instance : defaultValue;
    },
  };
}

/**
 * Typed per-business configuration registry (ROADMAP.md "add business
 * configuration registry"). Each entry owns one section's shape and safe
 * default; storage itself is generic (BusinessConfiguration: business_id +
 * key + JSON value, see schema.prisma), so a later module can register a
 * new section here without a schema migration. This is configuration data,
 * validated against a fixed shape -- never arbitrary code.
 *
 * `satisfies`, not a `: {...}` type annotation: an annotation would widen
 * every entry's `defaultValue` to the shared `object` bound, which is
 * exactly the bound `ConfigurationSections` below reads back out --
 * losing each section's own shape (e.g. `featureFlags.priceLists`) for
 * every consumer. `satisfies` still checks each entry against
 * `ConfigurationSectionDefinition<object>` without discarding the more
 * specific inferred type.
 */
export const CONFIGURATION_REGISTRY = {
  paymentMethods: definePlainSection(PaymentMethodsConfig, PAYMENT_METHODS_DEFAULT),
  featureFlags: definePlainSection(FeatureFlagsConfig, FEATURE_FLAGS_DEFAULT),
  policies: definePlainSection(PoliciesConfig, POLICIES_DEFAULT),
} satisfies Record<ConfigurationKey, ConfigurationSectionDefinition<object>>;

export type ConfigurationSections = {
  [K in ConfigurationKey]: (typeof CONFIGURATION_REGISTRY)[K]["defaultValue"];
};

/**
 * Resolves one section's value for a specific, statically-known key `K`
 * (a generic type parameter, not a runtime loop variable over
 * `ConfigurationKey`) so its return type stays that section's own shape
 * (e.g. `FeatureFlagsConfig`, not the `PaymentMethodsConfig &
 * FeatureFlagsConfig & PoliciesConfig` intersection TypeScript would
 * otherwise compute for a write indexed by the general union type).
 */
export function resolveConfigurationSection<K extends ConfigurationKey>(
  key: K,
  storedValue: unknown,
): ConfigurationSections[K] {
  const definition = CONFIGURATION_REGISTRY[key];
  const resolved =
    storedValue === undefined ? definition.defaultValue : definition.sanitize(storedValue);
  // TypeScript cannot correlate a generic indexed access
  // (`CONFIGURATION_REGISTRY[key]` for `key: K`) back to `ConfigurationSections[K]`
  // -- a known limitation of generic indexed access into a mapped type
  // (it widens `definition` to the union of every section, rather than
  // narrowing to the one matching `K`). By construction this always
  // holds: `ConfigurationSections[K]` is directly defined as
  // `CONFIGURATION_REGISTRY[K]["defaultValue"]`, and `resolved` is
  // either exactly that `defaultValue` or `sanitize`'s same-typed return
  // value for the very entry `key` selected.
  return resolved as ConfigurationSections[K];
}
