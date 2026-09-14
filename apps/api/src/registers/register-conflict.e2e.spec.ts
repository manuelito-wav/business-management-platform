import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

/**
 * ROADMAP.md "test: cover register conflict and draft recovery" -- the
 * full SPECS.md 11.3 acceptance scenario, told as one story rather than
 * the smaller unit-style checks the previous checkpoint's tests already
 * cover (RegisterSessionsService.close's own integration/e2e specs).
 * Employee A has an active session on a register and an unfinished sale
 * against it; Employee B (unauthorized) and then an Administrator
 * (authorized, per D-045's register.override_close_conflict) both
 * attempt to close it. The server-tracked "unfinished sale tab" (an
 * in_progress Sale) is this suite's server-side analogue of the client-
 * side POS draft -- the draft itself is IndexedDB-only and covered
 * separately by apps/web's PosPage tests (see page.test.tsx's "recovers
 * an unfinished draft after another user force-closes the register
 * session").
 */
describe("Register conflict acceptance scenario (SPECS.md 11.3, D-045)", () => {
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
    await prisma.outboxEvent.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productStock.deleteMany();
    await prisma.cashMovement.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.registerSession.deleteMany();
    await prisma.register.deleteMany();
    await prisma.productPricing.deleteMany();
    await prisma.productIdentifier.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
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

  async function me(token: string) {
    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    return response.body as { id: string };
  }

  it("detects the conflict, rejects an unauthorized close, permits an authorized override, audits it, notifies Employee A via re-derived state, and keeps their unfinished sale recoverable", async () => {
    const ownerToken = await registerAndLogin("rc-owner@kiosk.test");

    const business = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Register Conflict Kiosk" })
      .expect(201);
    const businessId = business.body.id as string;

    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Beverages" })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Cola", categoryId: category.body.id })
      .expect(201);
    const productId = product.body.id as string;
    await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 5000, salePrice: 10000 })
      .expect(200);

    const register2 = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Register 2" })
      .expect(201);
    const register2Id = register2.body.id as string;

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

    // Employee A: opens Register 2 and leaves an unfinished sale on it.
    const employeeAToken = await registerAndLogin("rc-employee-a@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "rc-employee-a@kiosk.test", roleId: employeeRoleId })
      .expect(201);
    const employeeA = await me(employeeAToken);

    const sessionA = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${register2Id}/sessions`)
      .set("Authorization", `Bearer ${employeeAToken}`)
      .send({})
      .expect(201);
    const sessionAId = sessionA.body.id as string;

    const saleA = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales`)
      .set("Authorization", `Bearer ${employeeAToken}`)
      .send({ registerSessionId: sessionAId, productId, quantity: 1 })
      .expect(201);
    const saleAId = saleA.body.id as string;
    expect(saleA.body.status).toBe("in_progress");

    // Employee B: an unauthorized second user -- the conflict is detected
    // (the session belongs to Employee A) but continuation is refused,
    // per policy, since Employee B holds no override permission.
    const employeeBToken = await registerAndLogin("rc-employee-b@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "rc-employee-b@kiosk.test", roleId: employeeRoleId })
      .expect(201);

    const deniedClose = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionAId}/close`)
      .set("Authorization", `Bearer ${employeeBToken}`)
      .send()
      .expect(403);
    expect(deniedClose.body.error.code).toBe("REGISTER_SESSION_NOT_OWNED");

    // Employee A's session and unfinished sale are both untouched by the
    // rejected attempt.
    const stillMine = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/register-sessions/mine`)
      .set("Authorization", `Bearer ${employeeAToken}`)
      .expect(200);
    expect(stillMine.body.status).toBe("open");

    // An Administrator: authorized by policy (register.override_close_conflict,
    // seeded to Administrator per D-045) -- the same conflict is now
    // permitted, and the response's userId/closedByUserId pair is exactly
    // the "clear conflict identity" a future UI would surface as a warning.
    const adminToken = await registerAndLogin("rc-admin@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "rc-admin@kiosk.test", roleId: adminRoleId })
      .expect(201);
    const admin = await me(adminToken);

    const overrideClose = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/register-sessions/${sessionAId}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send()
      .expect(200);
    expect(overrideClose.body.userId).toBe(employeeA.id);
    expect(overrideClose.body.closedByUserId).toBe(admin.id);

    // Audited distinctly from a normal self-close, attributing the action
    // to the overriding Administrator.
    const auditEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { businessId, targetType: "register_session", targetId: sessionAId },
      orderBy: { createdAt: "desc" },
    });
    expect(auditEvent.action).toBe("register_session.closed_override");
    expect(auditEvent.actorUserId).toBe(admin.id);

    // "Notify the affected user": Employee A's own state re-derives from
    // the server on the very next request and now shows no open session
    // (D-045) -- this is the notification/reestablishment trigger itself,
    // not a separate persisted message.
    const afterOverride = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/register-sessions/mine`)
      .set("Authorization", `Bearer ${employeeAToken}`)
      .expect(200);
    expect(afterOverride.body).toEqual({});

    // Employee A's unfinished sale is NOT silently lost: it is still
    // exactly where it was, still in_progress, still tied to the
    // now-closed session -- the override closes the session, not the
    // sale (ARCHITECTURE.md: no module writes into another module's
    // tables outside the one settlement transaction, and closing a
    // register session is not a sales-module operation at all).
    const recoveredSale = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/sales/${saleAId}`)
      .set("Authorization", `Bearer ${employeeAToken}`)
      .expect(200);
    expect(recoveredSale.body.status).toBe("in_progress");
    expect(recoveredSale.body.registerSessionId).toBe(sessionAId);

    // Employee A must establish a fresh register session before any
    // further operation -- reopening succeeds and is a genuinely new
    // session, not the closed one.
    const sessionA2 = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/registers/${register2Id}/sessions`)
      .set("Authorization", `Bearer ${employeeAToken}`)
      .send({})
      .expect(201);
    expect(sessionA2.body.id).not.toBe(sessionAId);
    expect(sessionA2.body.status).toBe("open");
  });
});
