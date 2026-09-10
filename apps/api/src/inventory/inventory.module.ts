import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CatalogModule } from "../catalog/catalog.module";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { StockAlertsController } from "./stock-alerts.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, CatalogModule, AuditModule],
  controllers: [InventoryController, StockAlertsController],
  providers: [...domainProviders, InventoryService],
  // Exported for future modules (stock adjustments/losses next, sale
  // settlement in Phase 4) to call recordMovement within their own
  // transactions -- the same cross-module pattern PricingModule uses for
  // AuditService.
  exports: [InventoryService],
})
export class InventoryModule {}
