import { IsString, MinLength } from "class-validator";

export class LoginDto {
  /** Email or username -- SPECS.md 5.3 "Username or email". */
  @IsString()
  @MinLength(1)
  identifier!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
