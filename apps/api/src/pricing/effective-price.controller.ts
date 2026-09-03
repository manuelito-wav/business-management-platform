import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { PriceListsService } from "./price-lists.service";

/**
 * The "selection boundary" ROADMAP.md's price-list checkpoint asks for,
 * exposed as its own read endpoint (separate from PricingController's
 * GET .../pricing, which returns the raw ProductPricing record) --
 * nothing yet calls this from a real sale flow, see
 * PriceListsService.resolveEffectivePrice's own doc comment.
 */
@Controller("businesses/:businessId/products/:productId/effective-price")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class EffectivePriceController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  get(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Query("priceListId") priceListId?: string,
  ) {
    return this.priceLists.resolveEffectivePrice(user.id, businessId, productId, priceListId);
  }
}
