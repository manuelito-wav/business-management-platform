import { IsInt, Min } from "class-validator";

export class SetPriceListEntryDto {
  /** Override sale price in minor units (D-005), same convention as UpsertPricingDto.salePrice. */
  @IsInt()
  @Min(0)
  salePrice!: number;
}
