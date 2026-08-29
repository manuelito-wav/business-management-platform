import { IsString, MinLength } from "class-validator";

export class ConfirmPasswordResetDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  newPassword!: string;
}
