import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { BusinessAuthorizationGuard } from "./business-authorization.guard";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [PermissionsController, RolesController, MembershipsController],
  providers: [
    ...domainProviders,
    PermissionsService,
    RolesService,
    MembershipsService,
    BusinessAuthorizationGuard,
  ],
  exports: [PermissionsService, RolesService, MembershipsService, BusinessAuthorizationGuard],
})
export class MembershipsModule {}
