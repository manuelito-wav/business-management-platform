import { Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { ID_GENERATOR } from "../common/domain-providers";
import { CashMovementType, Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterSessionsService } from "../registers/register-sessions.service";
import { RecordCashMovementDto } from "./dto/record-cash-movement.dto";

/** SPECS.md 11.4: which movement types add cash to the drawer vs. take it out -- CashService.record derives the ledger's signed `amount` from this, the same "caller supplies a magnitude, the service applies the sign" split InventoryService.recordMovement already uses for reason-driven direction. */
const CASH_IN_TYPES: ReadonlySet<CashMovementType> = new Set<CashMovementType>([
  "deposit",
  "opening_fund",
  "sale_settlement",
]);

function signedAmount(type: CashMovementType, amount: number): number {
  return CASH_IN_TYPES.has(type) ? amount : -amount;
}

export interface RecordCashMovementInput {
  businessId: string;
  registerSessionId: string;
  actorUserId: string;
  type: CashMovementType;
  /** A non-negative magnitude, as entered/decided by the caller -- record() applies the sign itself. */
  amount: number;
  reason: string;
  notes?: string | null;
  correlationId: string;
}

/**
 * The append-only cash ledger (ROADMAP.md "add register cash movements";
 * SPECS.md 11.4/11.5) -- see schema.prisma's CashMovement doc comment for
 * the full field/sign reasoning. `record` is the low-level, composable
 * ledger write (no audit, no permission check -- takes the caller's own
 * transaction client), the exact relationship InventoryService.
 * recordMovement already has with its own command methods; `recordMovement`
 * below is its one caller today, covering the five manually-initiated
 * types. `sale_settlement`/`refund_reversal` have no caller yet -- they
 * are system-generated side effects ROADMAP.md's later "settle sales
 * with stock and cash effects" / "add audited cancellations and refunds"
 * checkpoints will produce by calling `record` directly from within
 * their own atomic transaction, never through this manual command.
 */
@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly registerSessions: RegisterSessionsService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async record(tx: Prisma.TransactionClient, input: RecordCashMovementInput) {
    return tx.cashMovement.create({
      data: {
        id: this.ids.generate(),
        businessId: input.businessId,
        registerSessionId: input.registerSessionId,
        actorUserId: input.actorUserId,
        type: input.type,
        amount: signedAmount(input.type, input.amount),
        reason: input.reason,
        notes: input.notes ?? null,
        correlationId: input.correlationId,
      },
    });
  }

  /**
   * A cashier/manager directly records a deposit, withdrawal, supplier
   * payment, expense, or opening fund against their own currently open
   * register session (SPECS.md 11.2's "authorized available registers"
   * scoping, applied at the session level -- see
   * RegisterSessionsService.requireOpenSession).
   */
  async recordMovement(
    actingUserId: string,
    businessId: string,
    registerSessionId: string,
    dto: RecordCashMovementDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "cash.manage");
    await this.registerSessions.requireOpenSession(businessId, registerSessionId);

    return this.prisma.$transaction(async (tx) => {
      const movement = await this.record(tx, {
        businessId,
        registerSessionId,
        actorUserId: actingUserId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason,
        notes: dto.notes,
        correlationId,
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "cash_movement.recorded",
        targetType: "cash_movement",
        targetId: movement.id,
        after: { type: dto.type, amount: movement.amount, registerSessionId },
        correlationId,
      });
      return movement;
    });
  }

  /** Any active member may review a session's movements (SPECS.md 12.1-style "according to permission and register/business scope" -- reading is not the privileged action here; recording one is). Works for an already-closed session too, e.g. for a later reconciliation review. */
  async list(actingUserId: string, businessId: string, registerSessionId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    await this.registerSessions.requireInBusiness(businessId, registerSessionId);
    return this.prisma.cashMovement.findMany({
      where: { businessId, registerSessionId },
      orderBy: { id: "asc" },
    });
  }
}
