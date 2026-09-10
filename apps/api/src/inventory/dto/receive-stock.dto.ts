import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class ReceiveStockDto {
  /** How many units/grams were received (D-008) -- always positive. */
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sourceOperationId?: string;
}
