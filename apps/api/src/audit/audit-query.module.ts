import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { AuditController } from "./audit.controller";
import { AuditModule } from "./audit.module";

/**
 * Separate from AuditModule specifically to avoid a circular dependency:
 * MembershipsModule imports AuditModule (to record membership/role
 * changes), so AuditModule itself cannot depend on MembershipsModule for
 * this controller's guard. This module is a pure top-level consumer --
 * nothing else imports it.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, AuditModule],
  controllers: [AuditController],
})
export class AuditQueryModule {}
