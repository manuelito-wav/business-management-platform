import { Module } from "@nestjs/common";
import { domainProviders } from "../common/domain-providers";
import { OutboxService } from "./outbox.service";

@Module({
  providers: [...domainProviders, OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
