import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { BusinessesModule } from "../businesses/businesses.module";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { ConfigurationController } from "./configuration.controller";
import { ConfigurationService } from "./configuration.service";

@Module({
  imports: [IdentityModule, MembershipsModule, BusinessesModule, AuditModule],
  controllers: [ConfigurationController],
  providers: [...domainProviders, ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
