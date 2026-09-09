import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { RegisterSessionsController } from "./register-sessions.controller";
import { RegisterSessionsService } from "./register-sessions.service";
import { RegistersController } from "./registers.controller";
import { RegistersService } from "./registers.service";

@Module({
  imports: [IdentityModule, MembershipsModule, AuditModule, ConfigurationModule],
  controllers: [RegistersController, RegisterSessionsController],
  providers: [...domainProviders, RegistersService, RegisterSessionsService],
  exports: [RegistersService, RegisterSessionsService],
})
export class RegistersModule {}
