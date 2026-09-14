import { IsString, MinLength } from "class-validator";
import { SaleLineInputDto } from "./sale-line-input.dto";

/** Starting a sale additionally fixes which register session it belongs to (ROADMAP.md "settle sales with stock and cash effects") -- addLine/updateLineQuantity/etc. never need it again, since a sale's registerSessionId never changes once set. */
export class StartSaleDto extends SaleLineInputDto {
  @IsString()
  @MinLength(1)
  registerSessionId!: string;
}
