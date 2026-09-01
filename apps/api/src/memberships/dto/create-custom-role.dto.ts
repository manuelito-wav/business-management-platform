import { ArrayMinSize, IsArray, IsString, Matches, MinLength } from "class-validator";

export class CreateCustomRoleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^[a-z_]+\.[a-z_]+$/, {
    each: true,
    message: "each permission code must match <module>.<action>",
  })
  permissionCodes!: string[];
}
