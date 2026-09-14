import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class CloseRegisterSessionDto {
  /** Physically counted drawer total, integer minor units (D-005). Required or not per the business's registerPolicy.requireCountedAmount configuration (SPECS.md 11.6 "where used"). */
  @IsOptional()
  @IsInt()
  @Min(0)
  countedAmount?: number;

  /** SPECS.md 11.6 "Observations" -- optional free-text notes on the close. */
  @IsOptional()
  @IsString()
  observations?: string;
}
