import { IsIn } from "class-validator";

/** SPECS.md 9.8 "Negative or Zero Profitability" -- the three options it enumerates. */
export const NEGATIVE_PROFITABILITY_HANDLING_OPTIONS = [
  "allowed_with_warning",
  "restricted_by_permission",
  "prohibited",
] as const;
export type NegativeProfitabilityHandling =
  (typeof NEGATIVE_PROFITABILITY_HANDLING_OPTIONS)[number];

export class PoliciesConfig {
  @IsIn(NEGATIVE_PROFITABILITY_HANDLING_OPTIONS)
  negativeProfitabilityHandling!: NegativeProfitabilityHandling;
}

/**
 * Defaults to requiring explicit permission rather than either silently
 * allowing no-profit sales or blocking them outright -- the same
 * permission-driven-by-default posture as the rest of this codebase
 * (D-038), applied to a new sensitive capability.
 */
export const POLICIES_DEFAULT: PoliciesConfig = {
  negativeProfitabilityHandling: "restricted_by_permission",
};
