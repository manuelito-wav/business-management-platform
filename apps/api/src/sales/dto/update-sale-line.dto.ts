import { IsInt, Min } from "class-validator";

export class UpdateSaleLineDto {
  /** Whole units for "unit"; integer grams for "weighted" (D-008) -- always positive; use removeLine to take a line out entirely. */
  @IsInt()
  @Min(1)
  quantity!: number;
}
