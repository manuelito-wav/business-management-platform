import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Audit writer", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let roles: RolesService;
  let audit: AuditService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        ...domainProviders,
        UsersService,
        PasswordHasherService,
        PermissionsService,
        RolesService,
        MembershipsService,
        BusinessesService,
        AuditService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    roles = moduleRef.get(RolesService);
    audit = moduleRef.get(AuditService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.role.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createOwner(email: string) {
    const owner = await users.create({ email, password: "correct-horse-1" });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    return { owner, business };
  }

  it("records a minimal before/after event with actor, target, and correlation id", async () => {
    const { owner, business } = await createOwner("audit-owner1@kiosk.test");

    await prisma.$transaction((tx) =>
      audit.record(tx, {
        businessId: business.id,
        actorUserId: owner.id,
        action: "test.action",
        targetType: "test",
        targetId: "target-1",
        before: { value: "old" },
        after: { value: "new" },
        correlationId: TEST_CORRELATION_ID,
      }),
    );

    const rows = await prisma.auditEvent.findMany({ where: { businessId: business.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: owner.id,
      action: "test.action",
      targetType: "test",
      targetId: "target-1",
      beforeData: { value: "old" },
      afterData: { value: "new" },
      correlationId: TEST_CORRELATION_ID,
    });
  });

  it("allows omitting before/after (e.g. a creation has no 'before')", async () => {
    const { owner, business } = await createOwner("audit-owner2@kiosk.test");

    await prisma.$transaction((tx) =>
      audit.record(tx, {
        businessId: business.id,
        actorUserId: owner.id,
        action: "test.created",
        targetType: "test",
        targetId: "target-2",
        after: { value: "new" },
        correlationId: TEST_CORRELATION_ID,
      }),
    );

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { businessId: business.id } });
    expect(row.beforeData).toBeNull();
    expect(row.afterData).toEqual({ value: "new" });
  });

  it("adding a member writes a membership.created event", async () => {
    const { owner, business } = await createOwner("audit-owner3@kiosk.test");
    const employee = await users.create({
      email: "audit-employee3@kiosk.test",
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

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { businessId: business.id, action: "membership.created" },
    });
    expect(event.targetId).toBe(membership.id);
    expect(event.actorUserId).toBe(owner.id);
    expect(event.afterData).toEqual({ userId: employee.id, roleId: employeeRole.id });
  });

  it("updating a membership's role writes a membership.updated event with the real before/after", async () => {
    const { owner, business } = await createOwner("audit-owner4@kiosk.test");
    const employee = await users.create({
      email: "audit-employee4@kiosk.test",
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

    await memberships.updateMembership(
      owner.id,
      business.id,
      membership.id,
      { roleId: managerRole.id },
      TEST_CORRELATION_ID,
    );

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { businessId: business.id, action: "membership.updated" },
    });
    expect(event.beforeData).toEqual({ roleId: employeeRole.id, status: "active" });
    expect(event.afterData).toEqual({ roleId: managerRole.id, status: "active" });
  });

  it("creating a custom role writes a role.created event", async () => {
    const { owner, business } = await createOwner("audit-owner5@kiosk.test");

    const role = await roles.createCustomRole(
      owner.id,
      business.id,
      { name: "Night supervisor", permissionCodes: ["sales.cancel"] },
      TEST_CORRELATION_ID,
    );

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { businessId: business.id, action: "role.created" },
    });
    expect(event.targetId).toBe(role.id);
    expect(event.afterData).toEqual({
      name: "Night supervisor",
      permissionCodes: ["sales.cancel"],
    });
  });

  it("updating the business timezone writes a business.timezone_updated event", async () => {
    const { owner, business } = await createOwner("audit-owner6@kiosk.test");

    await businesses.updateTimezone(business.id, "America/Santiago", owner.id, TEST_CORRELATION_ID);

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { businessId: business.id, action: "business.timezone_updated" },
    });
    expect(event.beforeData).toEqual({ businessTimezone: "America/Argentina/Buenos_Aires" });
    expect(event.afterData).toEqual({ businessTimezone: "America/Santiago" });
  });

  it("lists events for one business only, most recent first, and paginates by cursor", async () => {
    const { owner, business } = await createOwner("audit-owner7@kiosk.test");
    const { business: otherBusiness } = await createOwner("audit-owner7b@kiosk.test");

    // Sequential (not Promise.all) so UUIDv7 ids -- and thus id-desc
    // ordering -- come out strictly increasing.
    for (let i = 0; i < 5; i += 1) {
      await prisma.$transaction((tx) =>
        audit.record(tx, {
          businessId: business.id,
          actorUserId: owner.id,
          action: `test.event.${i}`,
          targetType: "test",
          targetId: `target-${i}`,
          correlationId: TEST_CORRELATION_ID,
        }),
      );
    }
    await prisma.$transaction((tx) =>
      audit.record(tx, {
        businessId: otherBusiness.id,
        actorUserId: owner.id,
        action: "test.event.other-business",
        targetType: "test",
        targetId: "target-other",
        correlationId: TEST_CORRELATION_ID,
      }),
    );

    const firstPage = await audit.list(business.id, { limit: 2 });
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.data.map((event) => event.action)).toEqual(["test.event.4", "test.event.3"]);
    expect(firstPage.pagination.nextCursor).not.toBeNull();

    const secondPage = await audit.list(business.id, {
      limit: 2,
      cursor: firstPage.pagination.nextCursor ?? undefined,
    });
    expect(secondPage.data.map((event) => event.action)).toEqual(["test.event.2", "test.event.1"]);

    const thirdPage = await audit.list(business.id, {
      limit: 2,
      cursor: secondPage.pagination.nextCursor ?? undefined,
    });
    expect(thirdPage.data.map((event) => event.action)).toEqual(["test.event.0"]);
    expect(thirdPage.pagination.nextCursor).toBeNull();

    // Every event belongs to `business`, never `otherBusiness` -- tenant isolation.
    const allPages = [...firstPage.data, ...secondPage.data, ...thirdPage.data];
    expect(allPages.map((event) => event.action)).not.toContain("test.event.other-business");
  });
});
