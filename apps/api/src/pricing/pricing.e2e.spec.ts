import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Product pricing (HTTP)", () => {
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

  it("sets and reads pricing for a product", async () => {
    const ownerToken = await registerAndLogin("pricing-http-owner1@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Pricing HTTP Kiosk 1",
    );

    const set = await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 5000, salePrice: 10000 })
      .expect(200);
    expect(set.body.profit).toBe(5000);
    expect(set.body.marginPercentBasisPoints).toBe(10000);

    const read = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(read.body.salePrice).toBe(10000);
  });

  it("returns 404 reading pricing that has not been set yet", async () => {
    const ownerToken = await registerAndLogin("pricing-http-owner2@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Pricing HTTP Kiosk 2",
    );

    const denied = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404);
    expect(denied.body.error.code).toBe("PRODUCT_PRICING_NOT_FOUND");
  });

  it("lets an Employee read pricing but rejects setting it", async () => {
    const ownerToken = await registerAndLogin("pricing-http-owner3@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Pricing HTTP Kiosk 3",
    );
    await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 5000, salePrice: 7500 })
      .expect(200);

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
    const employeeToken = await registerAndLogin("pricing-http-employee3@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "pricing-http-employee3@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);

    const denied = await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ salePrice: 9000 })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects an ambiguous update combining costPrice with a target value, with a 400", async () => {
    const ownerToken = await registerAndLogin("pricing-http-owner4@kiosk.test");
    const { businessId, productId } = await setUpBusinessWithProduct(
      ownerToken,
      "Pricing HTTP Kiosk 4",
    );
    await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 5000, salePrice: 7500 })
      .expect(200);

    const denied = await request(app.getHttpServer())
      .put(`/businesses/${businessId}/products/${productId}/pricing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ costPrice: 6000, salePrice: 9000 })
      .expect(400);
    expect(denied.body.error.code).toBe("PRODUCT_PRICING_AMBIGUOUS_UPDATE");
  });
});
