import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { RegistersModule } from "../registers/registers.module";
import { CashController } from "./cash.controller";
import { CashService } from "./cash.service";

@Module({
  imports: [IdentityModule, MembershipsModule, RegistersModule, AuditModule],
  controllers: [CashController],
  providers: [...domainProviders, CashService],
  // Exported so later checkpoints (settle sales with stock and cash
  // effects; add audited cancellations and refunds) can call
  // CashService.record for sale_settlement/refund_reversal within their
  // own transaction -- the same cross-module pattern InventoryModule
  // already uses for InventoryService.
  exports: [CashService],
})
export class CashModule {}
