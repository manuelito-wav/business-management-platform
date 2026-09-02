import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Audit trail read API (HTTP)", () => {
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

  it("lets the Owner read the audit trail after a configuration change", async () => {
    const ownerToken = await registerAndLogin("audit-http-owner1@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit HTTP Kiosk 1" })
      .expect(201);
    const businessId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ paymentMethods: { enabled: ["cash"] } })
      .expect(200);

    const events = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/audit-events`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(events.body.data).toHaveLength(1);
    expect(events.body.data[0].action).toBe("configuration.updated");
    expect(events.body.data[0].afterData).toEqual({ paymentMethods: { enabled: ["cash"] } });
    expect(events.body.pagination.nextCursor).toBeNull();
  });

  it("rejects a member without audit.view (Employee)", async () => {
    const ownerToken = await registerAndLogin("audit-http-owner2@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit HTTP Kiosk 2" })
      .expect(201);
    const businessId = created.body.id as string;

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
    const employeeToken = await registerAndLogin("audit-http-employee2@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "audit-http-employee2@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/audit-events`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects a caller with no membership in the business", async () => {
    const ownerToken = await registerAndLogin("audit-http-owner3@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit HTTP Kiosk 3" })
      .expect(201);
    const businessId = created.body.id as string;

    const strangerToken = await registerAndLogin("audit-http-stranger3@kiosk.test");
    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/audit-events`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
  });

  it("paginates over HTTP using the returned cursor", async () => {
    const ownerToken = await registerAndLogin("audit-http-owner4@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit HTTP Kiosk 4" })
      .expect(201);
    const businessId = created.body.id as string;

    // Three separate configuration updates -> three audit events.
    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ paymentMethods: { enabled: ["cash"] } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ paymentMethods: { enabled: ["cash", "card"] } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ paymentMethods: { enabled: ["cash", "card", "qr"] } })
      .expect(200);

    const firstPage = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/audit-events?limit=2`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.pagination.nextCursor).not.toBeNull();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/businesses/${businessId}/audit-events?limit=2&cursor=${firstPage.body.pagination.nextCursor}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.pagination.nextCursor).toBeNull();

    const firstIds = firstPage.body.data.map((event: { id: string }) => event.id);
    const secondIds = secondPage.body.data.map((event: { id: string }) => event.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(3);
  });
});
