import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Business configuration registry (HTTP)", () => {
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
    await prisma.businessConfiguration.deleteMany();
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

  async function createBusiness(ownerToken: string, name: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name })
      .expect(201);
    return created.body.id as string;
  }

  it("returns the safe defaults, readable by any active member", async () => {
    const ownerToken = await registerAndLogin("config-http-owner1@kiosk.test");
    const businessId = await createBusiness(ownerToken, "HTTP Config Kiosk 1");

    const response = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.businessTimezone).toBe("America/Argentina/Buenos_Aires");
    expect(response.body.paymentMethods).toEqual({ enabled: ["cash", "qr", "card", "transfer"] });
    expect(response.body.policies).toEqual({
      negativeProfitabilityHandling: "restricted_by_permission",
    });
  });

  it("rejects reading configuration for a business the caller does not belong to", async () => {
    const ownerToken = await registerAndLogin("config-http-owner2@kiosk.test");
    const businessId = await createBusiness(ownerToken, "HTTP Config Kiosk 2");
    const strangerToken = await registerAndLogin("config-http-stranger2@kiosk.test");

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
  });

  it("lets the Owner update configuration and rejects an Employee doing the same", async () => {
    const ownerToken = await registerAndLogin("config-http-owner3@kiosk.test");
    const businessId = await createBusiness(ownerToken, "HTTP Config Kiosk 3");

    const updated = await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ paymentMethods: { enabled: ["cash"] } })
      .expect(200);
    expect(updated.body.paymentMethods).toEqual({ enabled: ["cash"] });

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

    const employeeToken = await registerAndLogin("config-http-employee3@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "config-http-employee3@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({
        featureFlags: {
          expirationTracking: true,
          currentAccounts: false,
          priceLists: false,
          scheduledReports: false,
        },
      })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects an invalid payment method with a 400, not a silent partial write", async () => {
    const ownerToken = await registerAndLogin("config-http-owner4@kiosk.test");
    const businessId = await createBusiness(ownerToken, "HTTP Config Kiosk 4");

    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ paymentMethods: { enabled: ["bitcoin"] } })
      .expect(400);

    const unchanged = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(unchanged.body.paymentMethods).toEqual({ enabled: ["cash", "qr", "card", "transfer"] });
  });

  it("rejects an unrecognized timezone with a 400", async () => {
    const ownerToken = await registerAndLogin("config-http-owner5@kiosk.test");
    const businessId = await createBusiness(ownerToken, "HTTP Config Kiosk 5");

    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ businessTimezone: "Not/A/Real/Zone" })
      .expect(400);
  });

  it("updates the business timezone through the same endpoint", async () => {
    const ownerToken = await registerAndLogin("config-http-owner6@kiosk.test");
    const businessId = await createBusiness(ownerToken, "HTTP Config Kiosk 6");

    const updated = await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ businessTimezone: "America/Santiago" })
      .expect(200);

    expect(updated.body.businessTimezone).toBe("America/Santiago");
  });
});
