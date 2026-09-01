import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { UsersService } from "../identity/users.service";
import { PrismaService } from "../prisma/prisma.service";

export interface AddMemberInput {
  email: string;
  roleId: string;
}

export interface UpdateMembershipInput {
  roleId?: string;
  status?: "active" | "inactive";
}

const membershipWithRole = {
  include: { role: { include: { rolePermissions: true } } },
} as const;
export type MembershipWithRole = Prisma.MembershipGetPayload<typeof membershipWithRole>;

/**
 * Owns Membership (and, transitively through Role, the permission
 * evaluation used by `requirePermission`). These checks run at two
 * layers by design (ROADMAP.md "enforce backend tenant authorization"):
 * BusinessAuthorizationGuard calls them first, at the HTTP boundary, for
 * every route that carries it; the methods below also call each other
 * directly, so the same invariant holds for callers that never go
 * through HTTP at all -- the kiosk dev seed script, and
 * BusinessesService's transaction-composed business creation.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async createMembership(
    tx: Prisma.TransactionClient,
    params: { userId: string; businessId: string; roleId: string },
  ) {
    return tx.membership.create({
      data: { id: this.ids.generate(), ...params },
    });
  }

  findActiveMembership(userId: string, businessId: string): Promise<MembershipWithRole | null> {
    return this.prisma.membership.findFirst({
      where: { userId, businessId, status: "active" },
      ...membershipWithRole,
    });
  }

  async requireActiveMembership(userId: string, businessId: string): Promise<MembershipWithRole> {
    const membership = await this.findActiveMembership(userId, businessId);
    if (!membership) {
      throw new AppException(
        "MEMBERSHIP_NOT_FOUND",
        "You do not have access to this business.",
        HttpStatus.FORBIDDEN,
      );
    }
    return membership;
  }

  async requirePermission(
    userId: string,
    businessId: string,
    permissionCode: string,
  ): Promise<MembershipWithRole> {
    const membership = await this.requireActiveMembership(userId, businessId);
    const hasPermission = membership.role.rolePermissions.some(
      (rolePermission) => rolePermission.permissionCode === permissionCode,
    );
    if (!hasPermission) {
      throw new AppException(
        "PERMISSION_DENIED",
        `Missing required permission: ${permissionCode}.`,
        HttpStatus.FORBIDDEN,
      );
    }
    return membership;
  }

  async addMember(actingUserId: string, businessId: string, input: AddMemberInput) {
    await this.requirePermission(actingUserId, businessId, "users.manage");
    await this.requireRoleInBusiness(businessId, input.roleId);

    const targetUser = await this.users.findByEmail(input.email);
    if (!targetUser) {
      throw new AppException(
        "USER_NOT_FOUND",
        "No user is registered with this email.",
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      return await this.prisma.membership.create({
        data: { id: this.ids.generate(), userId: targetUser.id, businessId, roleId: input.roleId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          "MEMBERSHIP_ALREADY_EXISTS",
          "This user is already a member of this business.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updateMembership(
    actingUserId: string,
    businessId: string,
    membershipId: string,
    input: UpdateMembershipInput,
  ) {
    await this.requirePermission(actingUserId, businessId, "users.manage");

    if (!input.roleId && !input.status) {
      throw new AppException(
        "VALIDATION_FAILED",
        "Provide at least one of roleId or status to update.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.businessId !== businessId) {
      throw new AppException("MEMBERSHIP_NOT_FOUND", "Membership not found.", HttpStatus.NOT_FOUND);
    }

    if (input.roleId) {
      await this.requireRoleInBusiness(businessId, input.roleId);
    }

    return this.prisma.membership.update({
      where: { id: membershipId },
      data: { roleId: input.roleId, status: input.status },
    });
  }

  async listForBusiness(actingUserId: string, businessId: string) {
    await this.requireActiveMembership(actingUserId, businessId);
    return this.prisma.membership.findMany({
      where: { businessId },
      ...membershipWithRole,
      orderBy: { createdAt: "asc" },
    });
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: "active" },
      ...membershipWithRole,
    });
    return memberships.map((membership) => ({
      businessId: membership.businessId,
      roleId: membership.roleId,
      roleName: membership.role.name,
    }));
  }

  /** Prevents assigning a role that belongs to a different business (cross-tenant leakage). */
  private async requireRoleInBusiness(businessId: string, roleId: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.businessId !== businessId) {
      throw new AppException(
        "ROLE_NOT_FOUND",
        "Role not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
