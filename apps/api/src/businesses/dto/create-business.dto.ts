import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateBusinessDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Defaults to America/Argentina/Buenos_Aires per D-035 when omitted. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  businessTimezone?: string;
}
