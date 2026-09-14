import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { CashService } from "../cash/cash.service";
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
  let cash: CashService;

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
        CashService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    registers = moduleRef.get(RegistersService);
    sessions = moduleRef.get(RegisterSessionsService);
    configuration = moduleRef.get(ConfigurationService);
    cash = moduleRef.get(CashService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.cashMovement.deleteMany();
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

  function close(
    actingUserId: string,
    businessId: string,
    sessionId: string,
    dto: { countedAmount?: number; observations?: string } = {},
  ) {
    return sessions.close(actingUserId, businessId, sessionId, dto, "test-correlation-id");
  }

  /** Adds a new member to the business under one of its predefined roles (Administrator/Manager/Employee), returning the created user. */
  async function addMemberWithRole(
    ownerId: string,
    businessId: string,
    emailPrefix: string,
    roleName: "Administrator" | "Manager" | "Employee",
  ) {
    const member = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const role = await prisma.role.findFirstOrThrow({ where: { businessId, name: roleName } });
    await memberships.addMember(
      ownerId,
      businessId,
      { email: member.email, roleId: role.id },
      "test-correlation-id",
    );
    return member;
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

    const closed = await sessions.close(
      owner.id,
      business.id,
      session.id,
      {},
      "test-correlation-id",
    );

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
      sessions.close(employee.id, business.id, session.id, {}, "test-correlation-id"),
    ).rejects.toMatchObject({ code: "REGISTER_SESSION_NOT_OWNED" });
  });

  it("rejects closing an already-closed session", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner8");
    const session = await open(owner.id, business.id, register.id);
    await sessions.close(owner.id, business.id, session.id, {}, "test-correlation-id");

    await expect(
      sessions.close(owner.id, business.id, session.id, {}, "test-correlation-id"),
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
    await sessions.close(owner.id, business.id, session.id, {}, "test-correlation-id");

    const forRegister = await sessions.list(owner.id, business.id, { registerId: register.id });
    expect(forRegister.map((s) => s.id)).toEqual([session.id]);

    const openOnly = await sessions.list(owner.id, business.id, { status: "open" });
    expect(openOnly.map((s) => s.registerId)).toEqual([otherRegister.id]);
  });

  it("records audit events for open and close", async () => {
    const { owner, business, register } = await createOwnerWithRegister("rs-owner11");
    const session = await open(owner.id, business.id, register.id);
    await sessions.close(owner.id, business.id, session.id, {}, "test-correlation-id");

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

  describe("closing with expected/counted amounts and discrepancy (SPECS.md 11.6)", () => {
    it("computes the expected amount from the opening amount plus this session's cash movements", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner13");
      const session = await open(owner.id, business.id, register.id, 5000);
      await cash.recordMovement(
        owner.id,
        business.id,
        session.id,
        { type: "deposit", amount: 3000, reason: "Refuerzo" },
        "test-correlation-id",
      );
      await cash.recordMovement(
        owner.id,
        business.id,
        session.id,
        { type: "expense", amount: 300, reason: "Compra de bolsas" },
        "test-correlation-id",
      );

      const closed = await close(owner.id, business.id, session.id, { countedAmount: 7700 });

      expect(closed.expectedAmount).toBe(7700);
      expect(closed.countedAmount).toBe(7700);
      expect(closed.discrepancy).toBe(0);
    });

    it("records a nonzero discrepancy without rejecting the close", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner14");
      const session = await open(owner.id, business.id, register.id, 5000);

      const closed = await close(owner.id, business.id, session.id, {
        countedAmount: 4800,
        observations: "Faltante sin explicar",
      });

      expect(closed.expectedAmount).toBe(5000);
      expect(closed.countedAmount).toBe(4800);
      expect(closed.discrepancy).toBe(-200);
      expect(closed.closingObservations).toBe("Faltante sin explicar");
    });

    it("leaves countedAmount/discrepancy null when no count is taken", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner15");
      const session = await open(owner.id, business.id, register.id, 5000);

      const closed = await close(owner.id, business.id, session.id);

      expect(closed.expectedAmount).toBe(5000);
      expect(closed.countedAmount).toBeNull();
      expect(closed.discrepancy).toBeNull();
    });

    it("requires a counted amount once registerPolicy.requireCountedAmount is enabled", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner16");
      const session = await open(owner.id, business.id, register.id);
      await configuration.updateSections(
        owner.id,
        business.id,
        { registerPolicy: { ...REGISTER_POLICY_DEFAULT, requireCountedAmount: true } },
        "test-correlation-id",
      );

      await expect(close(owner.id, business.id, session.id)).rejects.toMatchObject({
        code: "REGISTER_SESSION_COUNTED_AMOUNT_REQUIRED",
      });
      await expect(
        close(owner.id, business.id, session.id, { countedAmount: 0 }),
      ).resolves.toMatchObject({ status: "closed" });
    });

    it("records closedByUserId as the acting user for a self-close", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner17");
      const session = await open(owner.id, business.id, register.id);

      const closed = await close(owner.id, business.id, session.id);

      expect(closed.closedByUserId).toBe(owner.id);
    });
  });

  describe("register-closing conflict/override (SPECS.md 11.3, D-045)", () => {
    it("allows a holder of register.override_close_conflict to force-close another user's session", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner18");
      const session = await open(owner.id, business.id, register.id, 5000);
      const admin = await addMemberWithRole(owner.id, business.id, "rs-admin18", "Administrator");

      const closed = await close(admin.id, business.id, session.id, { countedAmount: 5000 });

      expect(closed.status).toBe("closed");
      expect(closed.userId).toBe(owner.id);
      expect(closed.closedByUserId).toBe(admin.id);
    });

    it("audits an override close distinctly from a normal self-close", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner19");
      const session = await open(owner.id, business.id, register.id);
      const admin = await addMemberWithRole(owner.id, business.id, "rs-admin19", "Administrator");

      await close(admin.id, business.id, session.id);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { businessId: business.id, targetType: "register_session", targetId: session.id },
        orderBy: { createdAt: "desc" },
      });
      expect(event.action).toBe("register_session.closed_override");
      expect(event.actorUserId).toBe(admin.id);
    });

    it("still rejects a Manager without the override permission from closing another user's session", async () => {
      const { owner, business, register } = await createOwnerWithRegister("rs-owner20");
      const session = await open(owner.id, business.id, register.id);
      const manager = await addMemberWithRole(owner.id, business.id, "rs-manager20", "Manager");

      await expect(close(manager.id, business.id, session.id)).rejects.toMatchObject({
        code: "REGISTER_SESSION_NOT_OWNED",
      });
    });
  });
});
