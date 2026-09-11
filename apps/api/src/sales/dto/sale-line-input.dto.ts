import { IsInt, IsString, Min, MinLength } from "class-validator";

/** Shared shape for both starting a sale and adding a further line -- both are "add a product at some quantity" (SalesService resolves name/saleMode/pricing server-side; nothing here is trusted as-is). */
export class SaleLineInputDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  /** Whole units for "unit"; integer grams for "weighted" (D-008) -- always positive. */
  @IsInt()
  @Min(1)
  quantity!: number;
}
