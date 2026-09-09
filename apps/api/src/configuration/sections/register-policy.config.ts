import { IsBoolean } from "class-validator";

/**
 * SPECS.md 11.6: "Opening and closing behavior should support
 * configurable business workflows." This checkpoint only ships the
 * opening side (whether a starting cash/change fund amount must be
 * entered to open a register session) -- the close-time expected/
 * counted/discrepancy fields and the multi-user conflict/override
 * policy (SPECS.md 11.3) are ROADMAP.md's later "register closing and
 * discrepancy handling" checkpoint, blocked on the still-open
 * register-closing conflict/override decision (DECISIONS.md "Pending
 * decisions").
 */
export class RegisterPolicyConfig {
  @IsBoolean()
  requireOpeningAmount!: boolean;
}

export const REGISTER_POLICY_DEFAULT: RegisterPolicyConfig = {
  requireOpeningAmount: false,
};
