import { IsBoolean } from "class-validator";

/**
 * SPECS.md 11.6: "Opening and closing behavior should support
 * configurable business workflows." requireOpeningAmount gates the open
 * side; requireCountedAmount gates the close side (whether a physical
 * cash count must be entered to close a register session -- SPECS.md
 * 11.6's "Actual counted amounts where used"). The multi-user conflict/
 * override policy (SPECS.md 11.3) is not a per-business configuration
 * choice -- it is fixed by D-045 (permission-gated, not configurable).
 */
export class RegisterPolicyConfig {
  @IsBoolean()
  requireOpeningAmount!: boolean;

  @IsBoolean()
  requireCountedAmount!: boolean;
}

export const REGISTER_POLICY_DEFAULT: RegisterPolicyConfig = {
  requireOpeningAmount: false,
  requireCountedAmount: false,
};
