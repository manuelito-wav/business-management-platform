import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { InventoryService } from "./inventory.service";

/**
 * Read-only in this checkpoint: any active member may check a product's
 * current stock, the same routine-operational-info precedent as
 * ProductsController.list/findOne (no @RequirePermission). Writing a
 * movement has no HTTP endpoint yet -- ROADMAP.md's next checkpoint ("add
 * stock adjustments and losses") is what adds the first permission-gated
 * commands that call InventoryService.recordMovement.
 */
@Controller("businesses/:businessId/products/:productId/stock")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  getStock(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
  ) {
    return this.inventory.getStock(user.id, businessId, productId);
  }
}
