import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { InventoryService } from "./inventory.service";

/**
 * Separate controller from InventoryController: this route is scoped to
 * the business, not to one :productId, so it cannot share that
 * controller's base path. Read-only, same routine-operational-info
 * precedent as the per-product stock read (no @RequirePermission).
 */
@Controller("businesses/:businessId/inventory/alerts")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class StockAlertsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.inventory.listStockAlerts(user.id, businessId);
  }
}
