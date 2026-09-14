import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CashModule } from "../cash/cash.module";
import { CatalogModule } from "../catalog/catalog.module";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { InventoryModule } from "../inventory/inventory.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { OutboxModule } from "../outbox/outbox.module";
import { RegistersModule } from "../registers/registers.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [
    IdentityModule,
    MembershipsModule,
    CatalogModule,
    ConfigurationModule,
    AuditModule,
    RegistersModule,
    InventoryModule,
    CashModule,
    OutboxModule,
  ],
  controllers: [SalesController],
  providers: [...domainProviders, SalesService],
  exports: [SalesService],
})
export class SalesModule {}
