import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Registers and register sessions (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
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
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerAndLogin(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post("/users")
      .send({ email, password: "correct-horse-1" })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: email, password: "correct-horse-1" })
      .expect(200);
    return login.body.accessToken as string;
  }

  async function setUpBusinessWithRegister(ownerToken: string, businessName: string) {
    const business = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: businessName })
      .expect(201);
    const businessId = business.body.id as string;

    const register = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Register 1" })
      .expect(201);

    return { businessId, registerId: register.body.id as string };
  }

  it("opens, finds, and closes a register session", async () => {
    const ownerToken = await registerAndLogin("reg-http-owner1@kiosk.test");
    const { businessId, registerId } = await setUpBusinessWithRegister(
      ownerToken,
      "Registers HTTP Kiosk 1",
    );

    const opened = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({})
      .expect(201);
    const sessionId = opened.body.id as string;
    expect(opened.body.status).toBe("open");

    const mine = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/register-sessions/mine`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(mine.body.id).toBe(sessionId);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({})
      .expect(409);
    expect(denied.body.error.code).toBe("REGISTER_SESSION_ALREADY_OPEN");

    const closed = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send()
      .expect(200);
    expect(closed.body.status).toBe("closed");

    const mineAfterClose = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/register-sessions/mine`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    // Nest/Express serialize a null controller return value as an empty
    // JSON object body, not a JSON `null` literal.
    expect(mineAfterClose.body).toEqual({});
  });

  it("lets an Employee open and close their own session without register.manage, but rejects creating a register", async () => {
    const ownerToken = await registerAndLogin("reg-http-owner2@kiosk.test");
    const { businessId, registerId } = await setUpBusinessWithRegister(
      ownerToken,
      "Registers HTTP Kiosk 2",
    );

    const roles = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const employeeRole = (roles.body as { id: string; name: string }[]).find(
      (role) => role.name === "Employee",
    );
    if (!employeeRole) {
      throw new Error("Employee role was not seeded");
    }
    const employeeToken = await registerAndLogin("reg-http-employee2@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "reg-http-employee2@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const opened = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${opened.body.id}/close`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send()
      .expect(200);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ name: "Register 2" })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects opening a session on an inactive register, with a 409", async () => {
    const ownerToken = await registerAndLogin("reg-http-owner3@kiosk.test");
    const { businessId, registerId } = await setUpBusinessWithRegister(
      ownerToken,
      "Registers HTTP Kiosk 3",
    );
    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/registers/${registerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "inactive" })
      .expect(200);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({})
      .expect(409);
    expect(denied.body.error.code).toBe("REGISTER_INACTIVE");
  });

  it("closes with a counted amount, recording the computed expected/counted/discrepancy", async () => {
    const ownerToken = await registerAndLogin("reg-http-owner4@kiosk.test");
    const { businessId, registerId } = await setUpBusinessWithRegister(
      ownerToken,
      "Registers HTTP Kiosk 4",
    );
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    const opened = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ openingAmount: 5000 })
      .expect(201);
    const sessionId = opened.body.id as string;

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ type: "deposit", amount: 3000, reason: "Refuerzo" })
      .expect(201);

    const closed = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ countedAmount: 7500, observations: "Falta contar cambio" })
      .expect(200);

    expect(closed.body.expectedAmount).toBe(8000);
    expect(closed.body.countedAmount).toBe(7500);
    expect(closed.body.discrepancy).toBe(-500);
    expect(closed.body.closingObservations).toBe("Falta contar cambio");
    expect(closed.body.closedByUserId).toBe(me.body.id);
  });

  it("lets an Administrator force-close another user's open session (SPECS.md 11.3, D-045)", async () => {
    const ownerToken = await registerAndLogin("reg-http-owner5@kiosk.test");
    const { businessId, registerId } = await setUpBusinessWithRegister(
      ownerToken,
      "Registers HTTP Kiosk 5",
    );

    const roles = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const rolesBody = roles.body as { id: string; name: string }[];
    const employeeRoleId = rolesBody.find((role) => role.name === "Employee")?.id;
    const adminRoleId = rolesBody.find((role) => role.name === "Administrator")?.id;
    if (!employeeRoleId || !adminRoleId) {
      throw new Error("Employee/Administrator roles were not seeded");
    }

    const employeeToken = await registerAndLogin("reg-http-employee5@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "reg-http-employee5@kiosk.test", roleId: employeeRoleId })
      .expect(201);
    const employeeMe = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);

    const adminToken = await registerAndLogin("reg-http-admin5@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "reg-http-admin5@kiosk.test", roleId: adminRoleId })
      .expect(201);
    const adminMe = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const opened = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({})
      .expect(201);
    const sessionId = opened.body.id as string;

    const closed = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send()
      .expect(200);
    expect(closed.body.userId).toBe(employeeMe.body.id);
    expect(closed.body.closedByUserId).toBe(adminMe.body.id);

    // The affected user's own "mine" lookup already re-derives from server
    // state on every load (D-045's "reestablish operational context").
    const employeeMine = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/register-sessions/mine`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);
    expect(employeeMine.body).toEqual({});
  });

  it("rejects a Manager without the override permission force-closing another user's session, with a 403", async () => {
    const ownerToken = await registerAndLogin("reg-http-owner6@kiosk.test");
    const { businessId, registerId } = await setUpBusinessWithRegister(
      ownerToken,
      "Registers HTTP Kiosk 6",
    );

    const roles = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const rolesBody = roles.body as { id: string; name: string }[];
    const employeeRoleId = rolesBody.find((role) => role.name === "Employee")?.id;
    const managerRoleId = rolesBody.find((role) => role.name === "Manager")?.id;
    if (!employeeRoleId || !managerRoleId) {
      throw new Error("Employee/Manager roles were not seeded");
    }

    const employeeToken = await registerAndLogin("reg-http-employee6@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "reg-http-employee6@kiosk.test", roleId: employeeRoleId })
      .expect(201);

    const managerToken = await registerAndLogin("reg-http-manager6@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "reg-http-manager6@kiosk.test", roleId: managerRoleId })
      .expect(201);

    const opened = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${registerId}/sessions`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({})
      .expect(201);
    const sessionId = opened.body.id as string;

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send()
      .expect(403);
    expect(denied.body.error.code).toBe("REGISTER_SESSION_NOT_OWNED");
  });
});
