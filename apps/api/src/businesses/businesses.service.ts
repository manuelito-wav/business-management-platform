import { Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { ID_GENERATOR } from "../common/domain-providers";
import { PrismaService } from "../prisma/prisma.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { CreateBusinessDto } from "./dto/create-business.dto";

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly roles: RolesService,
    private readonly memberships: MembershipsService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * Creates the business, seeds its four predefined roles, and makes the
   * creator its Owner, all atomically. See RolesService.seedPredefinedRoles
   * and permission-catalog.ts for what "Owner" is granted.
   */
  async create(ownerId: string, dto: CreateBusinessDto) {
    await this.permissions.ensureCatalogSeeded();
    const businessId = this.ids.generate();

    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          id: businessId,
          name: dto.name,
          ...(dto.businessTimezone ? { businessTimezone: dto.businessTimezone } : {}),
        },
      });

      const roleIdsByName = await this.roles.seedPredefinedRoles(tx, businessId);
      const ownerRoleId = roleIdsByName["Owner"];
      if (!ownerRoleId) {
        // Would indicate a bug in PREDEFINED_ROLES/seedPredefinedRoles, not a user-facing condition.
        throw new Error("Predefined Owner role was not seeded for the new business.");
      }
      await this.memberships.createMembership(tx, {
        userId: ownerId,
        businessId,
        roleId: ownerRoleId,
      });

      return business;
    });
  }

  findManyByIds(ids: string[]) {
    return this.prisma.business.findMany({ where: { id: { in: ids } } });
  }
}
