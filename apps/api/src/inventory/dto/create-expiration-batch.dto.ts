import { IsDateString, IsInt, Min } from "class-validator";

export class CreateExpirationBatchDto {
  /** Informational (D-008's native inventory unit) -- never reconciled against ProductStock.quantityOnHand. */
  @IsInt()
  @Min(1)
  quantity!: number;

  /** ISO 8601 date/datetime; stored as a UTC instant (D-036) representing a calendar date. */
  @IsDateString()
  expiresAt!: string;
}
