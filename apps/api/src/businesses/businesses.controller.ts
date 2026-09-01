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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestWithUser["user"], @Body() dto: CreateBusinessDto) {
    return this.businesses.create(user.id, dto);
  }

  /** The businesses the caller currently has active membership in, for a business picker. */
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
   * Membership is validated fresh on every call, per ARCHITECTURE.md
   * Tenancy: a revoked membership takes effect on the next request.
   */
  @Post(":businessId/select")
  @HttpCode(HttpStatus.OK)
  async select(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
  ) {
    const membership = await this.memberships.requireActiveMembership(user.id, businessId);
    await this.authService.setActiveBusiness(user.sessionId, businessId);
    return { businessId, roleId: membership.roleId };
  }
}
