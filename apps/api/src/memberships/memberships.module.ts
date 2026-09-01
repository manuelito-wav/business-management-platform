import { Module } from "@nestjs/common";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [IdentityModule],
  controllers: [PermissionsController, RolesController, MembershipsController],
  providers: [...domainProviders, PermissionsService, RolesService, MembershipsService],
  exports: [PermissionsService, RolesService, MembershipsService],
})
export class MembershipsModule {}
