import { IsInt, Min } from "class-validator";

/**
 * SPECS.md 8.4: "The system should provide a configurable 'near
 * expiration' window." Days, not a timestamp -- a whole-day lead time
 * ("warn me N days before a batch expires"), independent of time-of-day.
 * Only meaningful once featureFlags.expirationTracking is enabled for the
 * business, but kept as its own section (the same split as
 * registerPolicy) rather than folded into featureFlags, which only ever
 * holds booleans.
 */
export class ExpirationPolicyConfig {
  @IsInt()
  @Min(0)
  nearExpirationWindowDays!: number;
}

export const EXPIRATION_POLICY_DEFAULT: ExpirationPolicyConfig = {
  nearExpirationWindowDays: 7,
};
