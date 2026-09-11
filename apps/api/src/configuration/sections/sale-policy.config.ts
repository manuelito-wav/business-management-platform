import { IsInt, Min } from "class-validator";

/**
 * ROADMAP.md "add sale aggregate and state transitions": "Define
 * abandonment rules so inactive tabs do not skew ticket-duration
 * reporting" (SPECS.md 14.4). A sale still `in_progress` whose
 * `firstItemAt` is older than this many minutes is considered abandoned
 * -- see SalesService.isAbandoned. Kept as its own section (the same
 * split as expirationPolicy/registerPolicy) rather than a hardcoded
 * constant, since "how long is too long" is an operational judgment call
 * each business may reasonably want to tune, not a fact this project can
 * assert universally. 240 minutes (4 hours) is a deliberate, reasonable
 * default for a same-day retail sale sitting untouched -- not a value
 * stated anywhere in SPECS.md/DECISIONS.md -- and cheap to change later.
 */
export class SalePolicyConfig {
  @IsInt()
  @Min(1)
  abandonmentThresholdMinutes!: number;
}

export const SALE_POLICY_DEFAULT: SalePolicyConfig = {
  abandonmentThresholdMinutes: 240,
};
