import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Register cash movements (HTTP)", () => {
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
    // cashMovement has a restricting FK to registerSession -- clear it first.
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

  async function setUpBusinessWithOpenSession(ownerToken: string, businessName: string) {
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

    const session = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${register.body.id}/sessions`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({})
      .expect(201);

    return { businessId, sessionId: session.body.id as string };
  }

  it("records a deposit, then an expense, and lists both in order", async () => {
    const ownerToken = await registerAndLogin("cash-http-owner1@kiosk.test");
    const { businessId, sessionId } = await setUpBusinessWithOpenSession(
      ownerToken,
      "Cash HTTP Kiosk 1",
    );

    const deposit = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ type: "deposit", amount: 5000, reason: "Refuerzo de caja" })
      .expect(201);
    expect(deposit.body.amount).toBe(5000);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ type: "expense", amount: 300, reason: "Compra de bolsas", notes: "Proveedor local" })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(list.body).toHaveLength(2);
    expect(list.body[0].type).toBe("deposit");
    expect(list.body[1]).toMatchObject({ type: "expense", amount: -300, notes: "Proveedor local" });
  });

  it("rejects a manual sale_settlement/refund_reversal type with a 400", async () => {
    const ownerToken = await registerAndLogin("cash-http-owner2@kiosk.test");
    const { businessId, sessionId } = await setUpBusinessWithOpenSession(
      ownerToken,
      "Cash HTTP Kiosk 2",
    );

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ type: "sale_settlement", amount: 1000, reason: "Intento manual" })
      .expect(400);
  });

  it("rejects a negative amount with a 400", async () => {
    const ownerToken = await registerAndLogin("cash-http-owner3@kiosk.test");
    const { businessId, sessionId } = await setUpBusinessWithOpenSession(
      ownerToken,
      "Cash HTTP Kiosk 3",
    );

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ type: "deposit", amount: -100, reason: "Inválido" })
      .expect(400);
  });

  it("rejects an Employee recording a cash movement (cash.manage not granted by default) with a 403", async () => {
    const ownerToken = await registerAndLogin("cash-http-owner4@kiosk.test");
    const { businessId, sessionId } = await setUpBusinessWithOpenSession(
      ownerToken,
      "Cash HTTP Kiosk 4",
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
    const employeeToken = await registerAndLogin("cash-http-employee4@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "cash-http-employee4@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionId}/cash-movements`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "deposit", amount: 1000, reason: "Refuerzo" })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects an unauthenticated request with a 401", async () => {
    await request(app.getHttpServer())
      .post("/businesses/some-id/register-sessions/some-session/cash-movements")
      .send({})
      .expect(401);
  });
});
