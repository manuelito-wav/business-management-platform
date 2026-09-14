import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Clock, IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { CloseRegisterSessionDto } from "./dto/close-register-session.dto";
import { OpenRegisterSessionDto } from "./dto/open-register-session.dto";
import { RegistersService } from "./registers.service";

/**
 * The operational open/close side of a register (SPECS.md 11.1/11.2/
 * 11.3/11.6, D-009, D-045) -- see schema.prisma's RegisterSession doc
 * comment for the "at most one open session per register" invariant and
 * the close-time expected/counted/discrepancy fields. Closing is
 * normally restricted to the session's own user; the multi-user
 * conflict/override scenario (SPECS.md 11.3) is handled by close()
 * itself allowing a holder of register.override_close_conflict to
 * force-close someone else's session, per D-045.
 */
@Injectable()
export class RegisterSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly registers: RegistersService,
    private readonly configuration: ConfigurationService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async open(
    actingUserId: string,
    businessId: string,
    registerId: string,
    dto: OpenRegisterSessionDto,
    correlationId: string,
  ) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    const register = await this.registers.requireInBusiness(businessId, registerId);
    if (register.status !== "active") {
      throw new AppException(
        "REGISTER_INACTIVE",
        "This register is inactive and cannot be opened.",
        HttpStatus.CONFLICT,
      );
    }

    const { registerPolicy } = await this.configuration.getSections(businessId);
    if (registerPolicy.requireOpeningAmount && dto.openingAmount === undefined) {
      throw new AppException(
        "REGISTER_SESSION_OPENING_AMOUNT_REQUIRED",
        "This business requires an opening amount to open a register session.",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const session = await tx.registerSession.create({
          data: {
            id: this.ids.generate(),
            businessId,
            registerId,
            userId: actingUserId,
            activeRegisterId: registerId,
            openingAmount: dto.openingAmount ?? null,
          },
        });
        await this.audit.record(tx, {
          businessId,
          actorUserId: actingUserId,
          action: "register_session.opened",
          targetType: "register_session",
          targetId: session.id,
          after: { registerId, openingAmount: session.openingAmount },
          correlationId,
        });
        return session;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Two concurrent opens for the same register both saw no open
        // session and both attempted a create; the unique constraint on
        // activeRegisterId let only one through (see schema.prisma's own
        // comment on that column).
        throw new AppException(
          "REGISTER_SESSION_ALREADY_OPEN",
          "This register already has an open session. Close it before opening a new one.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async close(
    actingUserId: string,
    businessId: string,
    sessionId: string,
    dto: CloseRegisterSessionDto,
    correlationId: string,
  ) {
    const membership = await this.memberships.requireActiveMembership(actingUserId, businessId);
    const session = await this.requireInBusiness(businessId, sessionId);

    const isOwnSession = session.userId === actingUserId;
    if (!isOwnSession) {
      // SPECS.md 11.3's multi-user conflict: closing someone else's
      // active session is allowed only for a holder of
      // register.override_close_conflict, with no extra confirmation
      // step beyond the permission check itself (D-045). Preserves the
      // plain REGISTER_SESSION_NOT_OWNED error for everyone else, rather
      // than a generic permission-denied message, since "you don't own
      // this session" remains the accurate reason for the common case.
      const canOverride = membership.role.rolePermissions.some(
        (rolePermission) => rolePermission.permissionCode === "register.override_close_conflict",
      );
      if (!canOverride) {
        throw new AppException(
          "REGISTER_SESSION_NOT_OWNED",
          "Only the user who opened this session can close it.",
          HttpStatus.FORBIDDEN,
        );
      }
    }
    if (session.status !== "open") {
      throw new AppException(
        "REGISTER_SESSION_ALREADY_CLOSED",
        "This register session is already closed.",
        HttpStatus.CONFLICT,
      );
    }

    const { registerPolicy } = await this.configuration.getSections(businessId);
    if (registerPolicy.requireCountedAmount && dto.countedAmount === undefined) {
      throw new AppException(
        "REGISTER_SESSION_COUNTED_AMOUNT_REQUIRED",
        "This business requires a counted amount to close a register session.",
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Expected drawer total: opening float plus the net effect of
      // every cash movement this session recorded (deposits/sale
      // settlements in, withdrawals/expenses/etc. out -- CashService
      // already signs `amount` by type, so a plain sum is enough).
      const movements = await tx.cashMovement.aggregate({
        where: { registerSessionId: sessionId },
        _sum: { amount: true },
      });
      const expectedAmount = (session.openingAmount ?? 0) + (movements._sum.amount ?? 0);
      const countedAmount = dto.countedAmount ?? null;
      const discrepancy = countedAmount === null ? null : countedAmount - expectedAmount;

      const updated = await tx.registerSession.update({
        where: { id: sessionId },
        data: {
          status: "closed",
          closedAt: this.clock.now(),
          activeRegisterId: null,
          closedByUserId: actingUserId,
          expectedAmount,
          countedAmount,
          discrepancy,
          closingObservations: dto.observations ?? null,
        },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: isOwnSession ? "register_session.closed" : "register_session.closed_override",
        targetType: "register_session",
        targetId: sessionId,
        before: { status: "open" },
        after: {
          status: "closed",
          expectedAmount,
          countedAmount,
          discrepancy,
          sessionOwnerUserId: session.userId,
        },
        correlationId,
      });
      return updated;
    });
  }

  async list(
    actingUserId: string,
    businessId: string,
    options: { registerId?: string; status?: "open" | "closed" },
  ) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.prisma.registerSession.findMany({
      where: { businessId, registerId: options.registerId, status: options.status },
      orderBy: { openedAt: "desc" },
    });
  }

  /** The caller's own currently open session in this business, or null if they have none. */
  async findMyOpenSession(actingUserId: string, businessId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.prisma.registerSession.findFirst({
      where: { businessId, userId: actingUserId, status: "open" },
    });
  }

  /**
   * Cross-module lookup (ROADMAP.md "add register cash movements"): the
   * same role ProductsService.findOne/RegistersService.requireInBusiness
   * play for their own modules -- another module (cash) validates a
   * register session exists, belongs to this business, and is currently
   * open, without ever reading the registerSession table directly
   * (ARCHITECTURE.md's module-boundary rule). Does not itself check
   * membership/permission -- the caller already does that for its own
   * action (e.g. cash.manage).
   */
  async requireOpenSession(businessId: string, sessionId: string) {
    const session = await this.requireInBusiness(businessId, sessionId);
    if (session.status !== "open") {
      throw new AppException(
        "REGISTER_SESSION_NOT_OPEN",
        "This register session is not open.",
        HttpStatus.CONFLICT,
      );
    }
    return session;
  }

  /**
   * Cross-module lookup, same role as ProductsService.findOne for other
   * modules that need "does this session exist in this business"
   * without caring about its open/closed status (e.g. CashService.list
   * reading an already-closed session's historical movements).
   */
  async requireInBusiness(businessId: string, sessionId: string) {
    const session = await this.prisma.registerSession.findUnique({ where: { id: sessionId } });
    if (!session || session.businessId !== businessId) {
      throw new AppException(
        "REGISTER_SESSION_NOT_FOUND",
        "Register session not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }
}
