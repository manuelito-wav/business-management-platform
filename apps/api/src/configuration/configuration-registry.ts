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
 */
export const CONFIGURATION_REGISTRY: {
  readonly [K in ConfigurationKey]: ConfigurationSectionDefinition<object>;
} = {
  paymentMethods: definePlainSection(PaymentMethodsConfig, PAYMENT_METHODS_DEFAULT),
  featureFlags: definePlainSection(FeatureFlagsConfig, FEATURE_FLAGS_DEFAULT),
  policies: definePlainSection(PoliciesConfig, POLICIES_DEFAULT),
};

export type ConfigurationSections = {
  [K in ConfigurationKey]: (typeof CONFIGURATION_REGISTRY)[K]["defaultValue"];
};
