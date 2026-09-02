import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

@Module({
  imports: [IdentityModule, MembershipsModule, AuditModule],
  controllers: [BusinessesController],
  providers: [...domainProviders, BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
