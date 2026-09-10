import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Expiration batches and alerts (HTTP)", () => {
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
    await prisma.productExpirationBatch.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productStock.deleteMany();
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

  async function setUpTrackedProduct(ownerToken: string, businessName: string) {
    const business = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: businessName })
      .expect(201);
    const businessId = business.body.id as string;

    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Dairy" })
      .expect(201);

    const product = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Milk",
        categoryId: category.body.id,
        expirationTrackingEnabled: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        featureFlags: {
          expirationTracking: true,
          currentAccounts: false,
          priceLists: false,
          scheduledReports: false,
          productImages: false,
        },
      })
      .expect(200);

    return { businessId, productId: product.body.id as string };
  }

  it("creates a batch, lists it as an alert once near expiration, then resolves it", async () => {
    const ownerToken = await registerAndLogin("exp-http-owner1@kiosk.test");
    const { businessId, productId } = await setUpTrackedProduct(
      ownerToken,
      "Expiration HTTP Kiosk 1",
    );

    const soon = new Date();
    soon.setDate(soon.getDate() + 1);
    const created = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/expiration-batches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 12, expiresAt: soon.toISOString() })
      .expect(201);
    const batchId = created.body.id as string;

    const alerts = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/inventory/expiration-alerts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(alerts.body).toEqual([
      {
        batchId,
        productId,
        productName: "Milk",
        quantity: 12,
        expiresAt: soon.toISOString(),
        status: "near_expiration",
      },
    ]);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/expiration-batches/${batchId}/resolve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    const afterResolve = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/inventory/expiration-alerts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(afterResolve.body).toEqual([]);
  });

  it("rejects creating a batch when the business has not enabled expiration tracking", async () => {
    const ownerToken = await registerAndLogin("exp-http-owner2@kiosk.test");
    const business = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Expiration HTTP Kiosk 2" })
      .expect(201);
    const businessId = business.body.id as string;
    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Dairy" })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Milk", categoryId: category.body.id, expirationTrackingEnabled: true })
      .expect(201);
    // featureFlags.expirationTracking left at its default (disabled).

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${product.body.id}/expiration-batches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 1, expiresAt: new Date().toISOString() })
      .expect(403);
    expect(denied.body.error.code).toBe("EXPIRATION_TRACKING_DISABLED");
  });

  it("rejects an Employee's batch creation, needing inventory.adjust", async () => {
    const ownerToken = await registerAndLogin("exp-http-owner3@kiosk.test");
    const { businessId, productId } = await setUpTrackedProduct(
      ownerToken,
      "Expiration HTTP Kiosk 3",
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
    const employeeToken = await registerAndLogin("exp-http-employee3@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "exp-http-employee3@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/expiration-batches`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ quantity: 1, expiresAt: new Date().toISOString() })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });
});
