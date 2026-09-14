import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

/**
 * The five manually-recordable movement types (SPECS.md 11.4). Deliberately
 * excludes `sale_settlement`/`refund_reversal` -- those are system-
 * generated side effects of later checkpoints' own commands, never a
 * direct human action through this endpoint (see CashService's own doc
 * comment).
 */
export const MANUAL_CASH_MOVEMENT_TYPES = [
  "deposit",
  "withdrawal",
  "supplier_payment",
  "expense",
  "opening_fund",
] as const;
export type ManualCashMovementType = (typeof MANUAL_CASH_MOVEMENT_TYPES)[number];

export class RecordCashMovementDto {
  @IsIn(MANUAL_CASH_MOVEMENT_TYPES)
  type!: ManualCashMovementType;

  /** Integer ARS minor units (D-005) -- a non-negative magnitude; SPECS.md 11.5 allows an intentional $0. CashService derives the ledger's signed amount from `type`. */
  @IsInt()
  @Min(0)
  amount!: number;

  /** SPECS.md 11.5 "Reason/category" -- required. */
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
