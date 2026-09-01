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
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { AddMemberDto } from "./dto/add-member.dto";
import { UpdateMembershipDto } from "./dto/update-membership.dto";
import { MembershipsService } from "./memberships.service";

@Controller("businesses/:businessId/memberships")
@UseGuards(AccessTokenGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.memberships.listForBusiness(user.id, businessId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.memberships.addMember(user.id, businessId, dto);
  }

  @Patch(":membershipId")
  update(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.memberships.updateMembership(user.id, businessId, membershipId, dto);
  }
}
