import { IsInt, IsOptional, Min } from "class-validator";

export class OpenRegisterSessionDto {
  /** Starting cash/change fund, integer minor units (D-005). Required or not per the business's registerPolicy.requireOpeningAmount configuration. */
  @IsOptional()
  @IsInt()
  @Min(0)
  openingAmount?: number;
}
