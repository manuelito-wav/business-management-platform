import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { IANA_TIMEZONES } from "../../common/iana-timezones";

export class CreateBusinessDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Defaults to America/Argentina/Buenos_Aires per D-035 when omitted. */
  @IsOptional()
  @IsIn(IANA_TIMEZONES)
  businessTimezone?: string;
}
