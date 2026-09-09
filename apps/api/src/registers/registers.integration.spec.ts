import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { RegistersService } from "./registers.service";

describe("Registers", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let registers: RegistersService;

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
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    registers = moduleRef.get(RegistersService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.registerSession.deleteMany();
    await prisma.register.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.role.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createOwner(emailPrefix: string) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    return { owner, business };
  }

  function create(actingUserId: string, businessId: string, name: string) {
    return registers.create(actingUserId, businessId, { name }, "test-correlation-id");
  }

  it("creates a register", async () => {
    const { owner, business } = await createOwner("reg-owner1");

    const register = await create(owner.id, business.id, "Register 1");

    expect(register.name).toBe("Register 1");
    expect(register.status).toBe("active");
  });

  it("rejects a duplicate register name in the same business", async () => {
    const { owner, business } = await createOwner("reg-owner2");
    await create(owner.id, business.id, "Register 1");

    await expect(create(owner.id, business.id, "Register 1")).rejects.toMatchObject({
      code: "REGISTER_NAME_ALREADY_EXISTS",
    });
  });

  it("allows the same register name in two different businesses", async () => {
    const { owner: ownerA, business: businessA } = await createOwner("reg-owner3a");
    const { owner: ownerB, business: businessB } = await createOwner("reg-owner3b");

    await expect(create(ownerA.id, businessA.id, "Register 1")).resolves.toBeDefined();
    await expect(create(ownerB.id, businessB.id, "Register 1")).resolves.toBeDefined();
  });

  it("lists registers alphabetically", async () => {
    const { owner, business } = await createOwner("reg-owner4");
    await create(owner.id, business.id, "Register 2");
    await create(owner.id, business.id, "Register 1");

    const list = await registers.list(owner.id, business.id);
    expect(list.map((register) => register.name)).toEqual(["Register 1", "Register 2"]);
  });

  it("updates a register's name and status", async () => {
    const { owner, business } = await createOwner("reg-owner5");
    const register = await create(owner.id, business.id, "Register 1");

    const updated = await registers.update(
      owner.id,
      business.id,
      register.id,
      { status: "inactive" },
      "test-correlation-id",
    );

    expect(updated.status).toBe("inactive");
    expect(updated.name).toBe("Register 1");
  });

  it("records audit events for register writes", async () => {
    const { owner, business } = await createOwner("reg-owner6");
    const register = await create(owner.id, business.id, "Register 1");
    await registers.update(
      owner.id,
      business.id,
      register.id,
      { status: "inactive" },
      "test-correlation-id",
    );

    const events = await prisma.auditEvent.findMany({
      where: { businessId: business.id, targetType: "register" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual(["register.created", "register.updated"]);
  });

  it("rejects writes without register.manage but allows listing", async () => {
    const { owner, business } = await createOwner("reg-owner7");
    await create(owner.id, business.id, "Register 1");

    const employee = await users.create({
      email: "reg-employee7@kiosk.test",
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

    await expect(create(employee.id, business.id, "Register 2")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    await expect(registers.list(employee.id, business.id)).resolves.toBeDefined();
  });
});
