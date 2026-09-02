import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditQueryModule } from "./audit/audit-query.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { ConfigurationModule } from "./configuration/configuration.module";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    MembershipsModule,
    BusinessesModule,
    ConfigurationModule,
    AuditQueryModule,
    CatalogModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
