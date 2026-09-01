import { IsEmail, IsString, MinLength } from "class-validator";

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  roleId!: string;
}
