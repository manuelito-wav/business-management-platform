import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { UpsertPricingDto } from "./dto/upsert-pricing.dto";
import { PricingService } from "./pricing.service";

@Controller("businesses/:businessId/products/:productId/pricing")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  findOne(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
  ) {
    return this.pricing.findOne(user.id, businessId, productId);
  }

  @Put()
  @RequirePermission("pricing.manage")
  upsert(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: UpsertPricingDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.pricing.upsert(user.id, businessId, productId, dto, correlationId);
  }
}
