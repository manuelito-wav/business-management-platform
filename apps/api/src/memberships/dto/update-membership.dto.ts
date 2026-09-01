import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateMembershipDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  roleId?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
