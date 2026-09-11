import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Inventory stock (HTTP)", () => {
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
    await prisma.inventoryMovement.deleteMany();
    await prisma.productStock.deleteMany();
    await prisma.productPricing.deleteMany();
    await prisma.productIdentifier.deleteMany();
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
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

  async function setUpBusinessWithProduct(
    ownerToken: string,
    businessName: string,
    minimumStock?: number,
  ) {
    const business = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: businessName })
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
      .send({
        name: "Cola",
        categoryId: category.body.id,
        ...(minimumStock === undefined ? {} : { minimumStock }),
      })
      .expect(201);

    return { businessId, productId: product.body.id as string };
  }

  it("reports zero stock for a product that has never had a movement", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner1@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 1",
    );

    const stock = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/stock`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(stock.body).toEqual({ productId, quantityOnHand: 0, updatedAt: null });
  });

  it("rejects an unauthenticated request", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner2@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 2",
    );

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/stock`)
      .expect(401);
  });

  it("rejects a caller with no membership in the business", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner3@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 3",
    );
    const strangerToken = await registerAndLogin("inv-http-stranger3@kiosk.test");

    const denied = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/stock`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
    expect(denied.body.error.code).toBe("MEMBERSHIP_NOT_FOUND");
  });

  it("returns 404 for a product that does not exist in the business", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner4@kiosk.test");
    const { businessId } = await setUpBusinessWithProduct(ownerToken, "Inventory HTTP Kiosk 4");

    const notFound = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/does-not-exist/stock`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404);
    expect(notFound.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  // -- receive / adjust / loss commands --------------------------------------

  it("receives, adjusts, and records a loss over HTTP, each reflected in the stock read", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner5@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 5",
    );

    const received = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 100 })
      .expect(201);
    expect(received.body.movement).toMatchObject({ reason: "receiving", quantity: 100 });
    expect(received.body.stock.quantityOnHand).toBe(100);

    const adjusted = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: -10 })
      .expect(201);
    expect(adjusted.body.stock.quantityOnHand).toBe(90);

    const lost = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/loss`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 5, lossReason: "damage" })
      .expect(201);
    expect(lost.body.movement).toMatchObject({
      reason: "loss",
      quantity: -5,
      lossReason: "damage",
    });
    expect(lost.body.stock.quantityOnHand).toBe(85);

    const stock = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/stock`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(stock.body.quantityOnHand).toBe(85);
  });

  it("rejects an Employee's receive/adjust/loss requests, needing inventory.adjust/inventory.record_loss", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner6@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 6",
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
    const employeeToken = await registerAndLogin("inv-http-employee6@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "inv-http-employee6@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const receiveDenied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/receive`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ quantity: 10 })
      .expect(403);
    expect(receiveDenied.body.error.code).toBe("PERMISSION_DENIED");

    const adjustDenied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/adjust`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ quantity: 10 })
      .expect(403);
    expect(adjustDenied.body.error.code).toBe("PERMISSION_DENIED");

    const lossDenied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/loss`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ quantity: 1, lossReason: "other" })
      .expect(403);
    expect(lossDenied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects a non-positive receive quantity with a 400", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner7@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 7",
    );

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 0 })
      .expect(400);
    expect(denied.body.error.correlationId).toBeDefined();
  });

  it("rejects a loss request missing lossReason with a validation error", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner8@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 8",
    );

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/loss`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 1 })
      .expect(400);
  });

  // -- low-stock / negative-stock alerts -------------------------------------

  it("lists stock alerts over HTTP, reflecting both negative and low-stock products", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner9@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Inventory HTTP Kiosk 9",
      5,
    );

    const emptyAlerts = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/inventory/alerts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    // No stock yet (implicit zero) is already <= minimumStock (5).
    expect(emptyAlerts.body).toEqual([
      {
        productId,
        productName: "Cola",
        quantityOnHand: 0,
        minimumStock: 5,
        negative: false,
        lowStock: true,
      },
    ]);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: -1 })
      .expect(201);

    const afterAdjust = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/inventory/alerts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(afterAdjust.body).toEqual([
      {
        productId,
        productName: "Cola",
        quantityOnHand: -1,
        minimumStock: 5,
        negative: true,
        lowStock: true,
      },
    ]);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products/${productId}/stock/receive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 20 })
      .expect(201);

    const afterReceive = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/inventory/alerts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(afterReceive.body).toEqual([]);
  });

  it("rejects an unauthenticated request to the alerts list", async () => {
    const ownerToken = await registerAndLogin("inv-http-owner10@kiosk.test");
    const { businessId } = await setUpBusinessWithProduct(ownerToken, "Inventory HTTP Kiosk 10");

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/inventory/alerts`)
      .expect(401);
  });
});
