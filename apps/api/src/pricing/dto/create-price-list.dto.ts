import { IsString, MinLength } from "class-validator";

export class CreatePriceListDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
