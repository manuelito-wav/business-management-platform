import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRegisterDto } from "./dto/create-register.dto";
import { UpdateRegisterDto } from "./dto/update-register.dto";

/**
 * Registers themselves (SPECS.md 11.1: belong to the business, never
 * permanently to a user). See RegisterSessionsService for the
 * operational open/close side.
 */
@Injectable()
export class RegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async create(
    actingUserId: string,
    businessId: string,
    dto: CreateRegisterDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "register.manage");

    try {
      return await this.prisma.$transaction(async (tx) => {
        const register = await tx.register.create({
          data: { id: this.ids.generate(), businessId, name: dto.name },
        });
        await this.audit.record(tx, {
          businessId,
          actorUserId: actingUserId,
          action: "register.created",
          targetType: "register",
          targetId: register.id,
          after: { name: register.name, status: register.status },
          correlationId,
        });
        return register;
      });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async update(
    actingUserId: string,
    businessId: string,
    registerId: string,
    dto: UpdateRegisterDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "register.manage");
    const existing = await this.requireInBusiness(businessId, registerId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.register.update({
          where: { id: registerId },
          data: { name: dto.name, status: dto.status },
        });
        await this.audit.record(tx, {
          businessId,
          actorUserId: actingUserId,
          action: "register.updated",
          targetType: "register",
          targetId: registerId,
          before: { name: existing.name, status: existing.status },
          after: { name: updated.name, status: updated.status },
          correlationId,
        });
        return updated;
      });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async list(actingUserId: string, businessId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.prisma.register.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  /** Also used by RegisterSessionsService to validate a registerId belongs to the same business, without RegisterSessionsService reaching into the registers table itself. */
  async requireInBusiness(businessId: string, registerId: string) {
    const register = await this.prisma.register.findUnique({ where: { id: registerId } });
    if (!register || register.businessId !== businessId) {
      throw new AppException(
        "REGISTER_NOT_FOUND",
        "Register not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return register;
  }

  private mapDuplicateNameError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new AppException(
        "REGISTER_NAME_ALREADY_EXISTS",
        "A register with this name already exists in this business.",
        HttpStatus.CONFLICT,
      );
    }
    return error;
  }
}
