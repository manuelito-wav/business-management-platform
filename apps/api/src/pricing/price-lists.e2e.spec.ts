import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { FEATURE_FLAGS_DEFAULT } from "../configuration/sections/feature-flags.config";
import { PrismaService } from "../prisma/prisma.service";

describe("Price lists (HTTP)", () => {
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
    await prisma.priceListEntry.deleteMany();
    await prisma.priceList.deleteMany();
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

  async function setUpPricedProduct(ownerToken: string, businessName: string) {
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
    const productId = product.body.id as string;

    await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 5000, salePrice: 10000 })
      .expect(200);

    return { businessId, productId };
  }

  async function enablePriceLists(ownerToken: string, businessId: string) {
    await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/configuration`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ featureFlags: { ...FEATURE_FLAGS_DEFAULT, priceLists: true } })
      .expect(200);
  }

  it("rejects creating a price list before the business enables the feature, with a 403", async () => {
    const ownerToken = await registerAndLogin("pl-http-owner1@kiosk.test");
    const { businessId } = await setUpPricedProduct(ownerToken, "Price Lists HTTP Kiosk 1");

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/price-lists`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Wholesale" })
      .expect(403);
    expect(denied.body.error.code).toBe("PRICE_LISTS_DISABLED");
  });

  it("creates a price list, sets an override, and resolves the effective price through it", async () => {
    const ownerToken = await registerAndLogin("pl-http-owner2@kiosk.test");
    const { businessId, productId } = await setUpPricedProduct(
      ownerToken,
      "Price Lists HTTP Kiosk 2",
    );
    await enablePriceLists(ownerToken, businessId);

    const list = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/price-lists`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Wholesale" })
      .expect(201);
    const priceListId = list.body.id as string;

    await request(app.getHttpServer())
      .put(`/businesses/${businessId}/price-lists/${priceListId}/entries/${productId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ salePrice: 8000 })
      .expect(200);

    const withList = await request(app.getHttpServer())
      .get(
        `/businesses/${businessId}/products/${productId}/effective-price?priceListId=${priceListId}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(withList.body).toEqual({ salePrice: 8000, source: "price_list", priceListId });

    const withoutList = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/effective-price`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(withoutList.body).toEqual({ salePrice: 10000, source: "default", priceListId: null });

    await request(app.getHttpServer())
      .delete(`/businesses/${businessId}/price-lists/${priceListId}/entries/${productId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204);

    const afterRemoval = await request(app.getHttpServer())
      .get(
        `/businesses/${businessId}/products/${productId}/effective-price?priceListId=${priceListId}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(afterRemoval.body).toEqual({ salePrice: 10000, source: "default", priceListId: null });
  });

  it("lets an Employee read price lists but rejects creating one", async () => {
    const ownerToken = await registerAndLogin("pl-http-owner3@kiosk.test");
    const { businessId } = await setUpPricedProduct(ownerToken, "Price Lists HTTP Kiosk 3");
    await enablePriceLists(ownerToken, businessId);

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
    const employeeToken = await registerAndLogin("pl-http-employee3@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "pl-http-employee3@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/price-lists`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/price-lists`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ name: "Retail" })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });
});
