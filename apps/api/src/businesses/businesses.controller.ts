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
import { AuthService } from "../identity/auth.service";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { CurrentMembership } from "../memberships/current-membership.decorator";
import type { MembershipWithRole } from "../memberships/memberships.service";
import { MembershipsService } from "../memberships/memberships.service";
import { BusinessesService } from "./businesses.service";
import { CreateBusinessDto } from "./dto/create-business.dto";

@Controller("businesses")
@UseGuards(AccessTokenGuard)
export class BusinessesController {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly memberships: MembershipsService,
    private readonly authService: AuthService,
  ) {}

  // Not business-scoped: creates a brand new tenant, so there is no
  // existing business to resolve or validate membership against.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestWithUser["user"], @Body() dto: CreateBusinessDto) {
    return this.businesses.create(user.id, dto);
  }

  // Not business-scoped: lists every business the caller belongs to,
  // across tenants, for a business picker.
  @Get()
  async listMine(@CurrentUser() user: RequestWithUser["user"]) {
    const memberships = await this.memberships.listForUser(user.id);
    const businesses = await this.businesses.findManyByIds(memberships.map((m) => m.businessId));
    const businessesById = new Map(businesses.map((business) => [business.id, business]));

    return memberships.flatMap((membership) => {
      const business = businessesById.get(membership.businessId);
      if (!business) {
        return [];
      }
      return [
        {
          businessId: business.id,
          businessName: business.name,
          roleId: membership.roleId,
          roleName: membership.roleName,
        },
      ];
    });
  }

  /**
   * Selects the caller's active business for this session (SPECS.md 4.2).
   * BusinessAuthorizationGuard already validated membership against the
   * :businessId path param (fresh on every call, per ARCHITECTURE.md
   * Tenancy: a revoked membership takes effect on the next request), so
   * this only has to persist the pointer.
   */
  @Post(":businessId/select")
  @HttpCode(HttpStatus.OK)
  @UseGuards(BusinessAuthorizationGuard)
  async select(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @CurrentMembership() membership: MembershipWithRole,
  ) {
    await this.authService.setActiveBusiness(user.sessionId, businessId);
    return { businessId, roleId: membership.roleId };
  }
}
