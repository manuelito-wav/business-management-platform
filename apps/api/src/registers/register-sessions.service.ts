import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Clock, IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { OpenRegisterSessionDto } from "./dto/open-register-session.dto";
import { RegistersService } from "./registers.service";

/**
 * The operational open/close side of a register (SPECS.md 11.1/11.2,
 * D-009) -- see schema.prisma's RegisterSession doc comment for the
 * "at most one open session per register" and "only the session's own
 * user may close it" invariants, and why the multi-user conflict/
 * override scenario (SPECS.md 11.3) is intentionally out of scope here.
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

  async close(actingUserId: string, businessId: string, sessionId: string, correlationId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    const session = await this.requireInBusiness(businessId, sessionId);

    if (session.userId !== actingUserId) {
      throw new AppException(
        "REGISTER_SESSION_NOT_OWNED",
        "Only the user who opened this session can close it.",
        HttpStatus.FORBIDDEN,
      );
    }
    if (session.status !== "open") {
      throw new AppException(
        "REGISTER_SESSION_ALREADY_CLOSED",
        "This register session is already closed.",
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.registerSession.update({
        where: { id: sessionId },
        data: { status: "closed", closedAt: this.clock.now(), activeRegisterId: null },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "register_session.closed",
        targetType: "register_session",
        targetId: sessionId,
        before: { status: "open" },
        after: { status: "closed" },
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

  private async requireInBusiness(businessId: string, sessionId: string) {
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
