import { Module } from "@nestjs/common";
import { domainProviders } from "../common/domain-providers";
import { AuditService } from "./audit.service";

@Module({
  providers: [...domainProviders, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
