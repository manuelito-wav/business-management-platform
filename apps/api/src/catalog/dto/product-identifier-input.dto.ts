import { IsIn, IsString, MinLength } from "class-validator";

export const PRODUCT_IDENTIFIER_TYPES = ["barcode", "sku", "external"] as const;

export class ProductIdentifierInputDto {
  @IsIn(PRODUCT_IDENTIFIER_TYPES)
  type!: (typeof PRODUCT_IDENTIFIER_TYPES)[number];

  @IsString()
  @MinLength(1)
  value!: string;
}
