import { IsString, MinLength } from "class-validator";

export class CreateRegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
