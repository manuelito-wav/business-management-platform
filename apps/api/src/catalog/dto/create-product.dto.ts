import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ProductIdentifierInputDto } from "./product-identifier-input.dto";

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @IsIn(["unit", "weighted"])
  saleMode?: "unit" | "weighted";

  /** Display/input preference only (D-008) -- required when saleMode is "weighted", rejected otherwise; enforced in ProductsService. */
  @IsOptional()
  @IsIn(["g", "kg"])
  weightUnit?: "g" | "kg";

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  /** Same native inventory unit as stock (D-008) -- whole units, or grams when saleMode is "weighted" (SPECS.md 7.3). */
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumStock?: number;

  /** Per-product opt-in (SPECS.md 8.4) -- only meaningful once the business also enables featureFlags.expirationTracking; enforced at ExpirationBatchesService.createBatch, not here. */
  @IsOptional()
  @IsBoolean()
  expirationTrackingEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductIdentifierInputDto)
  identifiers?: ProductIdentifierInputDto[];
}
