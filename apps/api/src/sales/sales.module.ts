import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CatalogModule } from "../catalog/catalog.module";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [IdentityModule, MembershipsModule, CatalogModule, ConfigurationModule, AuditModule],
  controllers: [SalesController],
  providers: [...domainProviders, SalesService],
  // Exported so ROADMAP.md's later "settle sales with stock and cash
  // effects" checkpoint can call SalesService.complete from within its
  // own transaction -- the same cross-module pattern InventoryModule
  // already uses for InventoryService.
  exports: [SalesService],
})
export class SalesModule {}
