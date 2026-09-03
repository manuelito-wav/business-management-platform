import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { domainProviders } from "../common/domain-providers";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

@Module({
  imports: [IdentityModule, MembershipsModule, CatalogModule],
  controllers: [PricingController],
  providers: [...domainProviders, PricingService],
  exports: [PricingService],
})
export class PricingModule {}
