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
 * Exercises the real HTTP stack (AccessTokenGuard + BusinessAuthorizationGuard
 * + @RequirePermission, wired exactly as main.ts wires them) end to end,
 * unlike businesses.integration.spec.ts, which calls the application
 * services directly and never goes through a guard at all.
 */
describe("Backend tenant authorization (HTTP)", () => {
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
    const accessToken: unknown = login.body.accessToken;
    if (typeof accessToken !== "string") {
      throw new Error("login did not return an accessToken");
    }
    return accessToken;
  }

  it("rejects an unauthenticated request", async () => {
    await request(app.getHttpServer()).get("/businesses/some-id/roles").expect(401);
  });

  it("allows the Owner to read and create roles in their own business", async () => {
    const ownerToken = await registerAndLogin("owner-http1@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "HTTP Test Kiosk" })
      .expect(201);
    const businessId: unknown = created.body.id;
    if (typeof businessId !== "string") {
      throw new Error("business creation did not return an id");
    }

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Night supervisor", permissionCodes: ["sales.cancel"] })
      .expect(201);
  });

  it("rejects a user with no membership in the business at all", async () => {
    const ownerToken = await registerAndLogin("owner-http2@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "HTTP Test Kiosk 2" })
      .expect(201);
    const businessId = created.body.id as string;

    const strangerToken = await registerAndLogin("stranger-http2@kiosk.test");
    const response = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
    expect(response.body.error.code).toBe("MEMBERSHIP_NOT_FOUND");
  });

  it("lets a member read roles but rejects creating one without roles.manage", async () => {
    const ownerToken = await registerAndLogin("owner-http3@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "HTTP Test Kiosk 3" })
      .expect(201);
    const businessId = created.body.id as string;

    const employeeToken = await registerAndLogin("employee-http3@kiosk.test");
    const rolesList = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const employeeRole = (rolesList.body as { id: string; name: string }[]).find(
      (role) => role.name === "Employee",
    );
    if (!employeeRole) {
      throw new Error("Employee role was not seeded");
    }

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "employee-http3@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    // Employee can read the roster (just needs membership)...
    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);

    // ...but cannot create a role (needs roles.manage, which Employee lacks).
    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/roles`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ name: "Ghost role", permissionCodes: ["sales.create"] })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("selects an active business over HTTP and reflects it on /auth/me", async () => {
    const ownerToken = await registerAndLogin("owner-http4@kiosk.test");
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "HTTP Test Kiosk 4" })
      .expect(201);
    const businessId = created.body.id as string;

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/select`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(me.body.activeBusinessId).toBe(businessId);
  });
});
