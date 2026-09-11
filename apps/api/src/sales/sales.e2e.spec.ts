import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Sale aggregate (HTTP)", () => {
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
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
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

  async function setUpBusinessWithPricedProduct(ownerToken: string, businessName: string) {
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

  it("starts a sale, reads it, adds/updates/removes a line, and cancels it", async () => {
    const ownerToken = await registerAndLogin("sale-http-owner1@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithPricedProduct(
      ownerToken,
      "Sales HTTP Kiosk 1",
    );

    const started = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId, quantity: 2 })
      .expect(201);
    const saleId = started.body.id as string;
    expect(started.body.status).toBe("in_progress");
    expect(started.body.total).toBe(20000);

    const read = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/sales/${saleId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(read.body.lines).toHaveLength(1);

    const secondProduct = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Sprite",
        categoryId: (
          await request(app.getHttpServer())
            .get(`/businesses/${businessId}/products/${productId}`)
            .set("Authorization", `Bearer ${ownerToken}`)
        ).body.categoryId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${secondProduct.body.id}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 4000, salePrice: 9000 })
      .expect(200);

    const withSecondLine = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales/${saleId}/lines`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId: secondProduct.body.id, quantity: 1 })
      .expect(201);
    expect(withSecondLine.body.lines).toHaveLength(2);
    expect(withSecondLine.body.total).toBe(29000);

    const secondLineId = withSecondLine.body.lines.find(
      (line: { productId: string }) => line.productId === secondProduct.body.id,
    ).id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/businesses/${businessId}/sales/${saleId}/lines/${secondLineId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ quantity: 3 })
      .expect(200);
    expect(updated.body.total).toBe(20000 + 9000 * 3);

    const removed = await request(app.getHttpServer())
      .delete(`/businesses/${businessId}/sales/${saleId}/lines/${secondLineId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(removed.body.lines).toHaveLength(1);
    expect(removed.body.total).toBe(20000);

    const cancelled = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales/${saleId}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("rejects a non-positive quantity with a 400", async () => {
    const ownerToken = await registerAndLogin("sale-http-owner2@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithPricedProduct(
      ownerToken,
      "Sales HTTP Kiosk 2",
    );

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId, quantity: 0 })
      .expect(400);
  });

  it("rejects starting a sale for a product with no pricing set, with a 409", async () => {
    const ownerToken = await registerAndLogin("sale-http-owner3@kiosk.test");
    const business = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Sales HTTP Kiosk 3" })
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
      .send({ name: "Sin precio", categoryId: category.body.id })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId: product.body.id, quantity: 1 })
      .expect(409);
    expect(response.body.error.code).toBe("SALE_PRODUCT_HAS_NO_PRICING");
  });

  it("rejects an Employee cancelling a sale (sales.cancel not granted by default) with a 403", async () => {
    const ownerToken = await registerAndLogin("sale-http-owner4@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithPricedProduct(
      ownerToken,
      "Sales HTTP Kiosk 4",
    );
    const started = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

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
    const employeeToken = await registerAndLogin("sale-http-employee4@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "sale-http-employee4@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales/${started.body.id}/cancel`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects reading a sale for a business the caller does not belong to, with a 403", async () => {
    const ownerToken = await registerAndLogin("sale-http-owner5@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithPricedProduct(
      ownerToken,
      "Sales HTTP Kiosk 5",
    );
    const started = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/sales`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    const strangerToken = await registerAndLogin("sale-http-stranger5@kiosk.test");

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/sales/${started.body.id}`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
  });

  it("rejects an unauthenticated request with a 401", async () => {
    await request(app.getHttpServer()).post("/businesses/some-id/sales").send({}).expect(401);
  });
});
