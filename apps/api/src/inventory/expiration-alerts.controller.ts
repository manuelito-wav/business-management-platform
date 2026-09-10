import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { ExpirationBatchesService } from "./expiration-batches.service";

/**
 * Separate from StockAlertsController by design (ROADMAP.md "Keep this
 * isolated from the non-expiration inventory path"): expiration alerts
 * are batch-level and unrelated to the negative/low-stock projection.
 * Read-only, same routine-operational-info precedent as the other alert
 * lists (no @RequirePermission).
 */
@Controller("businesses/:businessId/inventory/expiration-alerts")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class ExpirationAlertsController {
  constructor(private readonly expirationBatches: ExpirationBatchesService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.expirationBatches.listAlerts(user.id, businessId);
  }
}
