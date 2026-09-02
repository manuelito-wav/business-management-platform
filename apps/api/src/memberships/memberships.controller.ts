import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "./business-authorization.guard";
import { AddMemberDto } from "./dto/add-member.dto";
import { UpdateMembershipDto } from "./dto/update-membership.dto";
import { MembershipsService } from "./memberships.service";
import { RequirePermission } from "./require-permission.decorator";

@Controller("businesses/:businessId/memberships")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.memberships.listForBusiness(user.id, businessId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("users.manage")
  add(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: AddMemberDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.memberships.addMember(user.id, businessId, dto, correlationId);
  }

  @Patch(":membershipId")
  @RequirePermission("users.manage")
  update(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.memberships.updateMembership(user.id, businessId, membershipId, dto, correlationId);
  }
}
