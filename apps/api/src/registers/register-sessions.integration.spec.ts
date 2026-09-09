import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { REGISTER_POLICY_DEFAULT } from "../configuration/sections/register-policy.config";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterSessionsService } from "./register-sessions.service";
import { RegistersService } from "./registers.service";

describe("Register sessions", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let registers: RegistersService;
  let sessions: RegisterSessionsService;
  let configuration: ConfigurationService;

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
        RegistersService,
        RegisterSessionsService,
        ConfigurationService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    registers = moduleRef.get(RegistersService);
    sessions = moduleRef.get(RegisterSessionsService);
    configuration = moduleRef.get(ConfigurationService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.registerSession.deleteMany();
    await prisma.register.deleteMany();
    await prisma.businessConfiguration.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.role.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createOwnerWithRegister(emailPrefix: string) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const register = await registers.create(
      owner.id,
      business.id,
      { name: "Register 1" },
      "test-correlation-id",
    );
    return { owner, business, register };
  }

  function open(
    actingUserId: string,
    businessId: string,
    registerId: string,
    openingAmount?: number,
  ) {
    return sessions.open(
      actingUserId,
      businessId,
      registerId,
      { openingAmount },
      "test-correlation-id",
    );
  }

  it("opens a session on an active register", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner1");

    const session = await open(owner.id, business.id, register.id);

    expect(session.status).toBe("open");
    expect(session.userId).toBe(owner.id);
    expect(session.registerId).toBe(register.id);
    expect(session.closedAt).toBeNull();
  });

  it("rejects opening a session on an inactive register", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner2");
    await registers.update(
      owner.id,
      business.id,
      register.id,
      { status: "inactive" },
      "test-correlation-id",
    );

    await expect(open(owner.id, business.id, register.id)).rejects.toMatchObject({
      code: "REGISTER_INACTIVE",
    });
  });

  it("rejects opening a second session on a register that already has one open", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner3");
    await open(owner.id, business.id, register.id);

    await expect(open(owner.id, business.id, register.id)).rejects.toMatchObject({
      code: "REGISTER_SESSION_ALREADY_OPEN",
    });
  });

  it("allows opening without an amount by default", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner4");

    const session = await open(owner.id, business.id, register.id);

    expect(session.openingAmount).toBeNull();
  });

  it("requires an opening amount once registerPolicy.requireOpeningAmount is enabled", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner5");
    await configuration.updateSections(
      owner.id,
      business.id,
      { registerPolicy: { ...REGISTER_POLICY_DEFAULT, requireOpeningAmount: true } },
      "test-correlation-id",
    );

    await expect(open(owner.id, business.id, register.id)).rejects.toMatchObject({
      code: "REGISTER_SESSION_OPENING_AMOUNT_REQUIRED",
    });

    const session = await open(owner.id, business.id, register.id, 5000);
    expect(session.openingAmount).toBe(5000);
  });

  it("closes the caller's own session, allowing the register to be reopened", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner6");
    const session = await open(owner.id, business.id, register.id);

    const closed = await sessions.close(owner.id, business.id, session.id, "test-correlation-id");

    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();

    await expect(open(owner.id, business.id, register.id)).resolves.toMatchObject({
      status: "open",
    });
  });

  it("rejects closing a session opened by a different user", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner7");
    const session = await open(owner.id, business.id, register.id);

    const employee = await users.create({
      email: "rs-employee7@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      "test-correlation-id",
    );

    await expect(
      sessions.close(employee.id, business.id, session.id, "test-correlation-id"),
    ).rejects.toMatchObject({ code: "REGISTER_SESSION_NOT_OWNED" });
  });

  it("rejects closing an already-closed session", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner8");
    const session = await open(owner.id, business.id, register.id);
    await sessions.close(owner.id, business.id, session.id, "test-correlation-id");

    await expect(
      sessions.close(owner.id, business.id, session.id, "test-correlation-id"),
    ).rejects.toMatchObject({ code: "REGISTER_SESSION_ALREADY_CLOSED" });
  });

  it("finds the caller's own open session, or null when they have none", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner9");

    await expect(sessions.findMyOpenSession(owner.id, business.id)).resolves.toBeNull();

    const session = await open(owner.id, business.id, register.id);
    await expect(sessions.findMyOpenSession(owner.id, business.id)).resolves.toMatchObject({
      id: session.id,
    });
  });

  it("lists sessions filtered by register and status", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner10");
    const otherRegister = await registers.create(
      owner.id,
      business.id,
      { name: "Register 2" },
      "test-correlation-id",
    );
    const session = await open(owner.id, business.id, register.id);
    await open(owner.id, business.id, otherRegister.id);
    await sessions.close(owner.id, business.id, session.id, "test-correlation-id");

    const forRegister = await sessions.list(owner.id, business.id, { registerId: register.id });
    expect(forRegister.map((s) => s.id)).toEqual([session.id]);

    const openOnly = await sessions.list(owner.id, business.id, { status: "open" });
    expect(openOnly.map((s) => s.registerId)).toEqual([otherRegister.id]);
  });

  it("records audit events for open and close", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner11");
    const session = await open(owner.id, business.id, register.id);
    await sessions.close(owner.id, business.id, session.id, "test-correlation-id");

    const events = await prisma.auditEvent.findMany({
      where: { businessId: business.id, targetType: "register_session" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual([
      "register_session.opened",
      "register_session.closed",
    ]);
  });

  it("rejects a register belonging to a different business", async () => {
    const {
      owner: ownerA,
      business: businessA,
      register: registerA,
    } = await createOwnerWithRegister("rs-owner12a");
    const { owner: ownerB, business: businessB } = await createOwnerWithRegister("rs-owner12b");

    await expect(open(ownerB.id, businessB.id, registerA.id)).rejects.toMatchObject({
      code: "REGISTER_NOT_FOUND",
    });
    // Sanity: business A's own owner can still open it.
    await expect(open(ownerA.id, businessA.id, registerA.id)).resolves.toBeDefined();
  });
});
