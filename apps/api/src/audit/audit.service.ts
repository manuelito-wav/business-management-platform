import { Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuditEventPage, RecordAuditEventInput } from "./audit-event.types";

const DEFAULT_PAGE_LIMIT = 25;

/**
 * Deliberately depends on nothing beyond Prisma/the domain providers, so
 * every module that needs to record an event (memberships, businesses,
 * configuration, and later financial modules) can import this one without
 * risking a circular dependency. The permission-gated read endpoint lives
 * in a separate AuditQueryModule instead, which is free to depend on
 * MembershipsModule for its guard -- see audit-query.module.ts.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * Always called with the caller's own transaction client (D-042: every
   * finalized command that changes tenant-owned state produces an audit
   * record) -- the mutation and its audit record commit or roll back
   * together, never one without the other.
   */
  async record(tx: Prisma.TransactionClient, input: RecordAuditEventInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        id: this.ids.generate(),
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        beforeData: input.before as Prisma.InputJsonValue | undefined,
        afterData: input.after as Prisma.InputJsonValue | undefined,
        correlationId: input.correlationId,
      },
    });
  }

  /**
   * Cursor-based (D-041): ordered by id descending. IDs are UUIDv7
   * (D-033), which sort chronologically by construction, so `id` alone is
   * both a stable total order and the cursor -- no compound
   * (createdAt, id) cursor is needed to break ties within the same
   * millisecond, which plain createdAt-based paging would require.
   */
  async list(
    businessId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<AuditEventPage> {
    const limit = options.limit ?? DEFAULT_PAGE_LIMIT;

    const rows = await this.prisma.auditEvent.findMany({
      where: { businessId },
      orderBy: { id: "desc" },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        beforeData: row.beforeData,
        afterData: row.afterData,
        correlationId: row.correlationId,
        createdAt: row.createdAt,
      })),
      pagination: { nextCursor: hasMore && last ? last.id : null },
    };
  }
}
