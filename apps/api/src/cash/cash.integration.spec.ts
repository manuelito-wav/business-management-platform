import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterSessionsService } from "../registers/register-sessions.service";
import { RegistersService } from "../registers/registers.service";
import { CashService } from "./cash.service";

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Register cash movements (SPECS.md 11.4/11.5)", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let registers: RegistersService;
  let sessions: RegisterSessionsService;
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
    cash = moduleRef.get(CashService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // cashMovement has a restricting FK to registerSession -- clear it
    // first (same lesson as the earlier sale/product cleanup-ordering
    // fix).
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

  async function createOwnerWithOpenSession(emailPrefix: string) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const register = await registers.create(
      owner.id,
      business.id,
      { name: "Register 1" },
      TEST_CORRELATION_ID,
    );
    const session = await sessions.open(
      owner.id,
      business.id,
      register.id,
      {},
      TEST_CORRELATION_ID,
    );
    return { owner, business, register, session };
  }

  it("records a deposit as a positive amount and audits it", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner1");

    const movement = await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "deposit", amount: 5000, reason: "Refuerzo de caja" },
      TEST_CORRELATION_ID,
    );

    expect(movement.amount).toBe(5000);
    expect(movement.type).toBe("deposit");
    expect(movement.reason).toBe("Refuerzo de caja");
    expect(movement.notes).toBeNull();

    const events = await prisma.auditEvent.findMany({ where: { businessId: business.id } });
    expect(events.map((event) => event.action)).toContain("cash_movement.recorded");
  });

  it("records a withdrawal, supplier payment, and expense as negative amounts", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner2");

    const withdrawal = await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "withdrawal", amount: 2000, reason: "Retiro para depósito bancario" },
      TEST_CORRELATION_ID,
    );
    const supplierPayment = await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "supplier_payment", amount: 1500, reason: "Pago a proveedor de bebidas" },
      TEST_CORRELATION_ID,
    );
    const expense = await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "expense", amount: 300, reason: "Compra de bolsas" },
      TEST_CORRELATION_ID,
    );

    expect(withdrawal.amount).toBe(-2000);
    expect(supplierPayment.amount).toBe(-1500);
    expect(expense.amount).toBe(-300);
  });

  it("allows an intentional $0 amount (SPECS.md 11.5)", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner3");

    const movement = await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "opening_fund", amount: 0, reason: "Apertura sin fondo inicial" },
      TEST_CORRELATION_ID,
    );

    expect(movement.amount).toBe(0);
  });

  it("records optional notes alongside the required reason", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner4");

    const movement = await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      {
        type: "expense",
        amount: 300,
        reason: "Compra de bolsas",
        notes: "Pagado en efectivo al proveedor",
      },
      TEST_CORRELATION_ID,
    );

    expect(movement.notes).toBe("Pagado en efectivo al proveedor");
  });

  it("list returns every movement for a session in recorded order", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner5");
    await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "deposit", amount: 5000, reason: "Refuerzo" },
      TEST_CORRELATION_ID,
    );
    await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "expense", amount: 300, reason: "Compra de bolsas" },
      TEST_CORRELATION_ID,
    );

    const list = await cash.list(owner.id, business.id, session.id);

    expect(list.map((movement) => movement.type)).toEqual(["deposit", "expense"]);
  });

  it("rejects recording a movement against a closed session", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner6");
    await sessions.close(owner.id, business.id, session.id, TEST_CORRELATION_ID);

    await expect(
      cash.recordMovement(
        owner.id,
        business.id,
        session.id,
        { type: "deposit", amount: 1000, reason: "Refuerzo" },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "REGISTER_SESSION_NOT_OPEN" });
  });

  it("list still works for an already-closed session (a later reconciliation review)", async () => {
    const { owner, business, session } = await createOwnerWithOpenSession("cash-owner7");
    await cash.recordMovement(
      owner.id,
      business.id,
      session.id,
      { type: "deposit", amount: 1000, reason: "Refuerzo" },
      TEST_CORRELATION_ID,
    );
    await sessions.close(owner.id, business.id, session.id, TEST_CORRELATION_ID);

    const list = await cash.list(owner.id, business.id, session.id);

    expect(list).toHaveLength(1);
  });

  describe("tenancy and authorization", () => {
    it("rejects recording a movement for a session that belongs to a different business", async () => {
      const { session } = await createOwnerWithOpenSession("cash-tenant-a");
      const { owner: ownerB, business: businessB } =
        await createOwnerWithOpenSession("cash-tenant-b");

      await expect(
        cash.recordMovement(
          ownerB.id,
          businessB.id,
          session.id,
          { type: "deposit", amount: 1000, reason: "Refuerzo" },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "REGISTER_SESSION_NOT_FOUND" });
    });

    it("rejects a member without cash.manage", async () => {
      const { owner, business, session } = await createOwnerWithOpenSession("cash-perm-owner");
      const employee = await users.create({
        email: "cash-perm-employee@kiosk.test",
        password: "correct-horse-1",
      });
      const employeeRole = await prisma.role.findFirstOrThrow({
        where: { businessId: business.id, name: "Employee" },
      });
      // The seeded Employee role does not include cash.manage
      // (permission-catalog.ts: only Manager/Administrator/Owner do).
      await memberships.addMember(
        owner.id,
        business.id,
        { email: employee.email, roleId: employeeRole.id },
        TEST_CORRELATION_ID,
      );

      await expect(
        cash.recordMovement(
          employee.id,
          business.id,
          session.id,
          { type: "deposit", amount: 1000, reason: "Refuerzo" },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });
  });
});
