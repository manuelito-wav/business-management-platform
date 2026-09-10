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

  async function setUpBusinessWithProduct(ownerToken: string, businessName: string) {
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
      .send({ name: "Cola", categoryId: category.body.id })
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
});
