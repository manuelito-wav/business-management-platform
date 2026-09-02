import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Product catalog (HTTP)", () => {
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

  async function createBusiness(ownerToken: string, name: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post("/businesses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name })
      .expect(201);
    return created.body.id as string;
  }

  it("rejects an unauthenticated request", async () => {
    await request(app.getHttpServer()).get("/businesses/some-id/products").expect(401);
  });

  it("lets the Owner create a category and a product with a barcode, then find it by search", async () => {
    const ownerToken = await registerAndLogin("catalog-http-owner1@kiosk.test");
    const businessId = await createBusiness(ownerToken, "Catalog HTTP Kiosk 1");

    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Beverages" })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Coca-Cola 500ml",
        categoryId: category.body.id,
        identifiers: [{ type: "barcode", value: "7790895000015" }],
      })
      .expect(201);
    expect(created.body.identifiers).toHaveLength(1);

    const found = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products?search=7790895000015`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0].id).toBe(created.body.id);
  });

  it("lets an Employee read the catalog but rejects creating a product", async () => {
    const ownerToken = await registerAndLogin("catalog-http-owner2@kiosk.test");
    const businessId = await createBusiness(ownerToken, "Catalog HTTP Kiosk 2");
    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Beverages" })
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
    const employeeToken = await registerAndLogin("catalog-http-employee2@kiosk.test");
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "catalog-http-employee2@kiosk.test", roleId: employeeRole.id })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ name: "Cola", categoryId: category.body.id })
      .expect(403);
    expect(denied.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects a duplicate barcode within the same business with 409", async () => {
    const ownerToken = await registerAndLogin("catalog-http-owner3@kiosk.test");
    const businessId = await createBusiness(ownerToken, "Catalog HTTP Kiosk 3");
    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Beverages" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Sprite",
        categoryId: category.body.id,
        identifiers: [{ type: "barcode", value: "111" }],
      })
      .expect(201);

    const denied = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Fanta",
        categoryId: category.body.id,
        identifiers: [{ type: "barcode", value: "111" }],
      })
      .expect(409);
    expect(denied.body.error.code).toBe("PRODUCT_IDENTIFIER_ALREADY_EXISTS");
  });

  it("rejects an invalid imageUrl with a 400", async () => {
    const ownerToken = await registerAndLogin("catalog-http-owner4@kiosk.test");
    const businessId = await createBusiness(ownerToken, "Catalog HTTP Kiosk 4");
    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Beverages" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/businesses/${businessId}/products`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Cola", categoryId: category.body.id, imageUrl: "not-a-url" })
      .expect(400);
  });

  it("paginates over HTTP with a cursor", async () => {
    const ownerToken = await registerAndLogin("catalog-http-owner5@kiosk.test");
    const businessId = await createBusiness(ownerToken, "Catalog HTTP Kiosk 5");
    const category = await request(app.getHttpServer())
      .post(`/businesses/${businessId}/categories`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Beverages" })
      .expect(201);

    for (const name of ["Apple", "Banana", "Cherry"]) {
      await request(app.getHttpServer())
        .post(`/businesses/${businessId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name, categoryId: category.body.id })
        .expect(201);
    }

    const firstPage = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/products?limit=2`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(firstPage.body.data.map((product: { name: string }) => product.name)).toEqual([
      "Apple",
      "Banana",
    ]);
    expect(firstPage.body.pagination.nextCursor).not.toBeNull();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/businesses/${businessId}/products?limit=2&cursor=${firstPage.body.pagination.nextCursor}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(secondPage.body.data.map((product: { name: string }) => product.name)).toEqual([
      "Cherry",
    ]);
    expect(secondPage.body.pagination.nextCursor).toBeNull();
  });
});
