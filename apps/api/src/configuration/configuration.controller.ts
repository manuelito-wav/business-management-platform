import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { BusinessesService } from "../businesses/businesses.service";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { ConfigurationService } from "./configuration.service";
import { UpdateConfigurationDto } from "./dto/update-configuration.dto";

@Controller("businesses/:businessId/configuration")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class ConfigurationController {
  constructor(
    private readonly configuration: ConfigurationService,
    private readonly businesses: BusinessesService,
  ) {}

  /** Read access: any active member -- most of the app needs to know a business's own configuration. */
  @Get()
  async get(@Param("businessId") businessId: string) {
    const [business, sections] = await Promise.all([
      this.businesses.requireById(businessId),
      this.configuration.getSections(businessId),
    ]);
    return { businessTimezone: business.businessTimezone, ...sections };
  }

  @Patch()
  @RequirePermission("configuration.manage")
  async update(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: UpdateConfigurationDto,
  ) {
    const { businessTimezone, ...sectionPatch } = dto;

    if (businessTimezone) {
      await this.businesses.updateTimezone(businessId, businessTimezone);
    }
    const sections = await this.configuration.updateSections(user.id, businessId, sectionPatch);
    const business = await this.businesses.requireById(businessId);

    return { businessTimezone: business.businessTimezone, ...sections };
  }
}
