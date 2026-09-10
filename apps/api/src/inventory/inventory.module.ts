import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CatalogModule } from "../catalog/catalog.module";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { ExpirationAlertsController } from "./expiration-alerts.controller";
import { ExpirationBatchesController } from "./expiration-batches.controller";
import { ExpirationBatchesService } from "./expiration-batches.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { StockAlertsController } from "./stock-alerts.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, CatalogModule, AuditModule, ConfigurationModule],
  controllers: [
    InventoryController,
    StockAlertsController,
    ExpirationBatchesController,
    ExpirationAlertsController,
  ],
  providers: [...domainProviders, InventoryService, ExpirationBatchesService],
  // Exported for future modules (sale settlement in Phase 4) to call
  // recordMovement within their own transactions -- the same cross-module
  // pattern PricingModule uses for AuditService.
  exports: [InventoryService],
})
export class InventoryModule {}
