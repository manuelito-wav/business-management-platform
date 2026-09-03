import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
