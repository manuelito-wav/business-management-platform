import { Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import type { RecordOutboxEventInput } from "./outbox-event.types";

/**
 * ARCHITECTURE.md "Outbox" / "synchronization owns outbox events" --
 * deliberately depends on nothing beyond Prisma/the domain providers
 * (same reasoning as AuditService's own doc comment), so every module
 * that produces a fact needing later synchronization can import this one
 * without risking a circular dependency. `record` is always called with
 * the caller's own transaction client, the same fact-and-its-outbox-
 * event-commit-or-roll-back-together guarantee AuditService.record
 * already gives audit records (D-042).
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(ID_GENERATOR) private readonly ids: IdGenerator) {}

  async record(tx: Prisma.TransactionClient, input: RecordOutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        id: this.ids.generate(),
        businessId: input.businessId,
        eventType: input.eventType,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: input.payload as Prisma.InputJsonValue,
        correlationId: input.correlationId,
      },
    });
  }
}
