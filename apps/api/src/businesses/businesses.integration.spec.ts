import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { domainProviders } from "../common/domain-providers";
import { AuthService } from "../identity/auth.service";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { TokenService } from "../identity/token.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { BusinessesService } from "./businesses.service";

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Businesses, memberships, and roles", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let auth: AuthService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let roles: RolesService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        ...domainProviders,
        UsersService,
        AuthService,
        PasswordHasherService,
        TokenService,
        PermissionsService,
        RolesService,
        MembershipsService,
        BusinessesService,
        AuditService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    auth = moduleRef.get(AuthService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    roles = moduleRef.get(RolesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Deleted explicitly in dependency order rather than relying on cascade
    // ordering across two paths (business->membership and business->role).
    // The global permission catalog is left alone -- it is idempotent
    // reference data, not per-test state.
    await prisma.rolePermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.role.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.business.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createOwner(email: string) {
    const owner = await users.create({ email, password: "correct-horse-1" });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    return { owner, business };
  }

  it("seeds the four predefined roles and makes the creator its Owner", async () => {
    const { owner, business } = await createOwner("owner1@kiosk.test");

    const businessRoles = await prisma.role.findMany({ where: { businessId: business.id } });
    expect(businessRoles.map((role) => role.name).sort()).toEqual([
      "Administrator",
      "Employee",
      "Manager",
      "Owner",
    ]);
    expect(businessRoles.every((role) => role.isSystem)).toBe(true);

    const ownerMembership = await memberships.findActiveMembership(owner.id, business.id);
    expect(ownerMembership?.role.name).toBe("Owner");
  });

  it("grants the Owner role every permission currently in the catalog", async () => {
    const { business } = await createOwner("owner2@kiosk.test");

    const catalogSize = await prisma.permission.count();
    const ownerRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Owner" },
      include: { rolePermissions: true },
    });

    expect(ownerRole.rolePermissions).toHaveLength(catalogSize);
  });

  it("lets the Owner add a member by email with a valid role", async () => {
    const { owner, business } = await createOwner("owner3@kiosk.test");
    const employee = await users.create({
      email: "employee3@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });

    const membership = await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      TEST_CORRELATION_ID,
    );

    expect(membership.userId).toBe(employee.id);
    expect(membership.roleId).toBe(employeeRole.id);
  });

  it("rejects adding a member without users.manage permission", async () => {
    const { owner, business } = await createOwner("owner4@kiosk.test");
    const cashier = await users.create({
      email: "cashier4@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: cashier.email, roleId: employeeRole.id },
      TEST_CORRELATION_ID,
    );

    const outsider = await users.create({
      email: "outsider4@kiosk.test",
      password: "correct-horse-1",
    });

    // The cashier (Employee role, no users.manage) tries to add a member.
    await expect(
      memberships.addMember(
        cashier.id,
        business.id,
        { email: outsider.email, roleId: employeeRole.id },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects a caller with no membership in the business at all", async () => {
    const { business } = await createOwner("owner5@kiosk.test");
    const stranger = await users.create({
      email: "stranger5@kiosk.test",
      password: "correct-horse-1",
    });
    const target = await users.create({ email: "target5@kiosk.test", password: "correct-horse-1" });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });

    await expect(
      memberships.addMember(
        stranger.id,
        business.id,
        { email: target.email, roleId: employeeRole.id },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
  });

  it("rejects adding the same member twice", async () => {
    const { owner, business } = await createOwner("owner6@kiosk.test");
    const employee = await users.create({
      email: "employee6@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      TEST_CORRELATION_ID,
    );

    await expect(
      memberships.addMember(
        owner.id,
        business.id,
        { email: employee.email, roleId: employeeRole.id },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_ALREADY_EXISTS" });
  });

  it("rejects assigning a role that belongs to a different business", async () => {
    const { owner: owner1, business: business1 } = await createOwner("owner7a@kiosk.test");
    const { business: business2 } = await createOwner("owner7b@kiosk.test");
    const foreignRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business2.id, name: "Employee" },
    });
    const target = await users.create({ email: "target7@kiosk.test", password: "correct-horse-1" });

    await expect(
      memberships.addMember(
        owner1.id,
        business1.id,
        { email: target.email, roleId: foreignRole.id },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "ROLE_NOT_FOUND" });
  });

  it("lets the Owner create a custom role with valid permission codes", async () => {
    const { owner, business } = await createOwner("owner8@kiosk.test");

    const role = await roles.createCustomRole(
      owner.id,
      business.id,
      { name: "Night supervisor", permissionCodes: ["sales.cancel", "reports.view"] },
      TEST_CORRELATION_ID,
    );

    expect(role.isSystem).toBe(false);
    expect(
      role.rolePermissions.map((rolePermission) => rolePermission.permissionCode).sort(),
    ).toEqual(["reports.view", "sales.cancel"]);
  });

  it("deduplicates a repeated permission code instead of rejecting or double-inserting it", async () => {
    const { owner, business } = await createOwner("owner8b@kiosk.test");

    const role = await roles.createCustomRole(
      owner.id,
      business.id,
      { name: "Repeats supervisor", permissionCodes: ["sales.cancel", "sales.cancel"] },
      TEST_CORRELATION_ID,
    );

    expect(role.rolePermissions.map((rolePermission) => rolePermission.permissionCode)).toEqual([
      "sales.cancel",
    ]);
  });

  it("rejects creating a custom role with an unknown permission code", async () => {
    const { owner, business } = await createOwner("owner9@kiosk.test");

    await expect(
      roles.createCustomRole(
        owner.id,
        business.id,
        { name: "Ghost role", permissionCodes: ["sales.teleport"] },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERMISSION_CODE" });
  });

  it("rejects a custom role name that collides with an existing role in the same business", async () => {
    const { owner, business } = await createOwner("owner10@kiosk.test");

    await expect(
      roles.createCustomRole(
        owner.id,
        business.id,
        { name: "Owner", permissionCodes: ["sales.create"] },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "ROLE_NAME_ALREADY_EXISTS" });
  });

  it("updates a membership's role and can revoke it", async () => {
    const { owner, business } = await createOwner("owner11@kiosk.test");
    const employee = await users.create({
      email: "employee11@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    const managerRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Manager" },
    });
    const membership = await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      TEST_CORRELATION_ID,
    );

    const promoted = await memberships.updateMembership(
      owner.id,
      business.id,
      membership.id,
      { roleId: managerRole.id },
      TEST_CORRELATION_ID,
    );
    expect(promoted.roleId).toBe(managerRole.id);

    const revoked = await memberships.updateMembership(
      owner.id,
      business.id,
      membership.id,
      { status: "inactive" },
      TEST_CORRELATION_ID,
    );
    expect(revoked.status).toBe("inactive");
    expect(await memberships.findActiveMembership(employee.id, business.id)).toBeNull();
  });

  it("lists only the businesses a user actively belongs to", async () => {
    const { owner, business } = await createOwner("owner12@kiosk.test");

    const list = await memberships.listForUser(owner.id);

    expect(list).toEqual([
      { businessId: business.id, roleId: expect.any(String), roleName: "Owner" },
    ]);
  });

  it("lets a session select an active business only when the caller is an active member", async () => {
    const { owner, business } = await createOwner("owner13@kiosk.test");
    const stranger = await users.create({
      email: "stranger13@kiosk.test",
      password: "correct-horse-1",
    });
    const session = await auth.login("owner13@kiosk.test", "correct-horse-1");

    await expect(
      memberships.requireActiveMembership(stranger.id, business.id),
    ).rejects.toMatchObject({
      code: "MEMBERSHIP_NOT_FOUND",
    });

    const validated = await auth.validateAccessToken(session.accessToken);
    await memberships.requireActiveMembership(owner.id, business.id);
    await auth.setActiveBusiness(validated.sessionId, business.id);

    const afterSelection = await auth.validateAccessToken(session.accessToken);
    expect(afterSelection.activeBusinessId).toBe(business.id);
  });
});
