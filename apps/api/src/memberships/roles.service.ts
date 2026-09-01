import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MembershipsService } from "./memberships.service";
import { PREDEFINED_ROLES } from "./permission-catalog";

export interface CreateCustomRoleInput {
  name: string;
  permissionCodes: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * Creates the four predefined roles (SPECS.md 3.1) for a newly created
   * business, within the caller's transaction. Returns the new role IDs
   * keyed by name so the caller can look up e.g. "Owner".
   */
  async seedPredefinedRoles(
    tx: Prisma.TransactionClient,
    businessId: string,
  ): Promise<Record<string, string>> {
    const roleIdsByName: Record<string, string> = {};

    for (const definition of PREDEFINED_ROLES) {
      const roleId = this.ids.generate();
      roleIdsByName[definition.name] = roleId;

      await tx.role.create({
        data: {
          id: roleId,
          businessId,
          name: definition.name,
          isSystem: true,
          rolePermissions: {
            create: definition.permissionCodes.map((permissionCode) => ({ permissionCode })),
          },
        },
      });
    }

    return roleIdsByName;
  }

  async createCustomRole(actingUserId: string, businessId: string, input: CreateCustomRoleInput) {
    await this.memberships.requirePermission(actingUserId, businessId, "roles.manage");

    // Deduplicated up front: `permission.count` counts distinct matching
    // rows, so a duplicated code in the input would otherwise make a
    // fully valid list look short by comparison, and an undeduplicated
    // create() would attempt the same (roleId, permissionCode) pair
    // twice and surface a misleading ROLE_NAME_ALREADY_EXISTS below.
    const permissionCodes = [...new Set(input.permissionCodes)];

    const knownCodes = await this.prisma.permission.count({
      where: { code: { in: permissionCodes } },
    });
    if (knownCodes !== permissionCodes.length) {
      throw new AppException(
        "INVALID_PERMISSION_CODE",
        "One or more permission codes do not exist in the catalog.",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.prisma.role.create({
        data: {
          id: this.ids.generate(),
          businessId,
          name: input.name,
          isSystem: false,
          rolePermissions: {
            create: permissionCodes.map((permissionCode) => ({ permissionCode })),
          },
        },
        include: { rolePermissions: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          "ROLE_NAME_ALREADY_EXISTS",
          "A role with this name already exists in this business.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async listForBusiness(actingUserId: string, businessId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.prisma.role.findMany({
      where: { businessId },
      include: { rolePermissions: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
