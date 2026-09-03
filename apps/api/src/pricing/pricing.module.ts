import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CatalogModule } from "../catalog/catalog.module";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { EffectivePriceController } from "./effective-price.controller";
import { PriceListsController } from "./price-lists.controller";
import { PriceListsService } from "./price-lists.service";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

@Module({
  imports: [IdentityModule, MembershipsModule, CatalogModule, AuditModule, ConfigurationModule],
  controllers: [PricingController, PriceListsController, EffectivePriceController],
  providers: [...domainProviders, PricingService, PriceListsService],
  exports: [PricingService, PriceListsService],
})
export class PricingModule {}
