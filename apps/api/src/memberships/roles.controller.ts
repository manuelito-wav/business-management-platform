import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "./business-authorization.guard";
import { CreateCustomRoleDto } from "./dto/create-custom-role.dto";
import { RequirePermission } from "./require-permission.decorator";
import { RolesService } from "./roles.service";

@Controller("businesses/:businessId/roles")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.roles.listForBusiness(user.id, businessId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("roles.manage")
  create(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: CreateCustomRoleDto,
  ) {
    return this.roles.createCustomRole(user.id, businessId, dto);
  }
}
