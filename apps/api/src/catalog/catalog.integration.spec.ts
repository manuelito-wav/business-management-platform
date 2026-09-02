import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "./categories.service";
import { ProductsService } from "./products.service";

describe("Product catalog: categories, products, and identifiers", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let categories: CategoriesService;
  let products: ProductsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        ...domainProviders,
        UsersService,
        PasswordHasherService,
        PermissionsService,
        RolesService,
        MembershipsService,
        BusinessesService,
        AuditService,
        CategoriesService,
        ProductsService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
    await prisma.user.deleteMany();
  });

  async function createOwner(email: string) {
    const owner = await users.create({ email, password: "correct-horse-1" });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    return { owner, business };
  }

  // -- Categories --------------------------------------------------------

  it("creates and lists categories alphabetically", async () => {
    const { owner, business } = await createOwner("cat-owner1@kiosk.test");

    await categories.create(owner.id, business.id, { name: "Frozen" });
    await categories.create(owner.id, business.id, { name: "Beverages" });

    const list = await categories.list(owner.id, business.id);
    expect(list.map((category) => category.name)).toEqual(["Beverages", "Frozen"]);
  });

  it("rejects a duplicate category name in the same business", async () => {
    const { owner, business } = await createOwner("cat-owner2@kiosk.test");
    await categories.create(owner.id, business.id, { name: "Beverages" });

    await expect(
      categories.create(owner.id, business.id, { name: "Beverages" }),
    ).rejects.toMatchObject({ code: "CATEGORY_NAME_ALREADY_EXISTS" });
  });

  it("allows the same category name in two different businesses", async () => {
    const { owner: ownerA, business: businessA } = await createOwner("cat-owner3a@kiosk.test");
    const { owner: ownerB, business: businessB } = await createOwner("cat-owner3b@kiosk.test");

    await expect(
      categories.create(ownerA.id, businessA.id, { name: "Beverages" }),
    ).resolves.toBeDefined();
    await expect(
      categories.create(ownerB.id, businessB.id, { name: "Beverages" }),
    ).resolves.toBeDefined();
  });

  it("deactivates a category via status update rather than deleting it", async () => {
    const { owner, business } = await createOwner("cat-owner4@kiosk.test");
    const category = await categories.create(owner.id, business.id, { name: "Beverages" });

    const updated = await categories.update(owner.id, business.id, category.id, {
      status: "inactive",
    });

    expect(updated.status).toBe("inactive");
    expect(await prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull();
  });

  it("rejects category writes without catalog.manage", async () => {
    const { owner, business } = await createOwner("cat-owner5@kiosk.test");
    const employee = await users.create({
      email: "cat-employee5@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      "test-correlation-id",
    );

    await expect(
      categories.create(employee.id, business.id, { name: "Beverages" }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  // -- Products and identifiers -------------------------------------------

  async function createCategory(ownerId: string, businessId: string, name = "Beverages") {
    return categories.create(ownerId, businessId, { name });
  }

  it("creates a product with identifiers in one business", async () => {
    const { owner, business } = await createOwner("prod-owner1@kiosk.test");
    const category = await createCategory(owner.id, business.id);

    const product = await products.create(owner.id, business.id, {
      name: "Coca-Cola 500ml",
      categoryId: category.id,
      identifiers: [
        { type: "barcode", value: "7790895000015" },
        { type: "sku", value: " cc-500 " },
      ],
    });

    expect(product.saleMode).toBe("unit");
    expect(product.identifiers).toHaveLength(2);
    const sku = product.identifiers.find((identifier) => identifier.type === "sku");
    expect(sku?.normalizedValue).toBe("CC-500");
  });

  it("rejects a product whose category belongs to a different business", async () => {
    const { owner, business } = await createOwner("prod-owner2@kiosk.test");
    const { owner: otherOwner, business: otherBusiness } =
      await createOwner("prod-owner2b@kiosk.test");
    const foreignCategory = await createCategory(otherOwner.id, otherBusiness.id);

    await expect(
      products.create(owner.id, business.id, { name: "Ghost", categoryId: foreignCategory.id }),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });
  });

  it("rejects a duplicate barcode within the same business, at creation and when added later", async () => {
    const { owner, business } = await createOwner("prod-owner3@kiosk.test");
    const category = await createCategory(owner.id, business.id);
    const first = await products.create(owner.id, business.id, {
      name: "Sprite 500ml",
      categoryId: category.id,
      identifiers: [{ type: "barcode", value: "7790895000022" }],
    });

    await expect(
      products.create(owner.id, business.id, {
        name: "Fanta 500ml",
        categoryId: category.id,
        identifiers: [{ type: "barcode", value: "7790895000022" }],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_IDENTIFIER_ALREADY_EXISTS" });

    const second = await products.create(owner.id, business.id, {
      name: "Fanta 500ml",
      categoryId: category.id,
    });
    await expect(
      products.addIdentifier(owner.id, business.id, second.id, {
        type: "barcode",
        value: "7790895000022",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_IDENTIFIER_ALREADY_EXISTS" });

    // Sanity: the original product's identifier is untouched.
    expect(await prisma.productIdentifier.count({ where: { productId: first.id } })).toBe(1);
  });

  it("allows the same barcode to be used by two different businesses", async () => {
    const { owner: ownerA, business: businessA } = await createOwner("prod-owner4a@kiosk.test");
    const { owner: ownerB, business: businessB } = await createOwner("prod-owner4b@kiosk.test");
    const categoryA = await createCategory(ownerA.id, businessA.id);
    const categoryB = await createCategory(ownerB.id, businessB.id);

    await expect(
      products.create(ownerA.id, businessA.id, {
        name: "Water 500ml",
        categoryId: categoryA.id,
        identifiers: [{ type: "barcode", value: "7790000000001" }],
      }),
    ).resolves.toBeDefined();
    await expect(
      products.create(ownerB.id, businessB.id, {
        name: "Water 500ml",
        categoryId: categoryB.id,
        identifiers: [{ type: "barcode", value: "7790000000001" }],
      }),
    ).resolves.toBeDefined();
  });

  it("removes an identifier by physical delete", async () => {
    const { owner, business } = await createOwner("prod-owner5@kiosk.test");
    const category = await createCategory(owner.id, business.id);
    const product = await products.create(owner.id, business.id, {
      name: "Chips",
      categoryId: category.id,
      identifiers: [{ type: "barcode", value: "111" }],
    });
    const identifier = product.identifiers[0];
    if (!identifier) {
      throw new Error("identifier was not created");
    }

    await products.removeIdentifier(owner.id, business.id, product.id, identifier.id);

    expect(await prisma.productIdentifier.findUnique({ where: { id: identifier.id } })).toBeNull();
  });

  it("searches by product name (case-insensitive, partial)", async () => {
    const { owner, business } = await createOwner("prod-owner6@kiosk.test");
    const category = await createCategory(owner.id, business.id);
    await products.create(owner.id, business.id, {
      name: "Coca-Cola 500ml",
      categoryId: category.id,
    });
    await products.create(owner.id, business.id, { name: "Sprite 500ml", categoryId: category.id });

    const result = await products.search(owner.id, business.id, { search: "coca" });

    expect(result.data.map((product) => product.name)).toEqual(["Coca-Cola 500ml"]);
  });

  it("searches by identifier regardless of case/whitespace (normalization)", async () => {
    const { owner, business } = await createOwner("prod-owner7@kiosk.test");
    const category = await createCategory(owner.id, business.id);
    await products.create(owner.id, business.id, {
      name: "Coca-Cola 500ml",
      categoryId: category.id,
      identifiers: [{ type: "sku", value: "cc-500" }],
    });

    const result = await products.search(owner.id, business.id, { search: " CC-500 " });

    expect(result.data.map((product) => product.name)).toEqual(["Coca-Cola 500ml"]);
  });

  it("filters by category", async () => {
    const { owner, business } = await createOwner("prod-owner8@kiosk.test");
    const beverages = await createCategory(owner.id, business.id, "Beverages");
    const snacks = await createCategory(owner.id, business.id, "Snacks");
    await products.create(owner.id, business.id, { name: "Cola", categoryId: beverages.id });
    await products.create(owner.id, business.id, { name: "Chips", categoryId: snacks.id });

    const result = await products.search(owner.id, business.id, { categoryId: beverages.id });

    expect(result.data.map((product) => product.name)).toEqual(["Cola"]);
  });

  it("paginates alphabetically by cursor", async () => {
    const { owner, business } = await createOwner("prod-owner9@kiosk.test");
    const category = await createCategory(owner.id, business.id);
    for (const name of ["Banana", "Apple", "Cherry", "Date"]) {
      await products.create(owner.id, business.id, { name, categoryId: category.id });
    }

    const firstPage = await products.search(owner.id, business.id, { limit: 2 });
    expect(firstPage.data.map((product) => product.name)).toEqual(["Apple", "Banana"]);
    expect(firstPage.pagination.nextCursor).not.toBeNull();

    const secondPage = await products.search(owner.id, business.id, {
      limit: 2,
      cursor: firstPage.pagination.nextCursor ?? undefined,
    });
    expect(secondPage.data.map((product) => product.name)).toEqual(["Cherry", "Date"]);
    expect(secondPage.pagination.nextCursor).toBeNull();
  });

  it("rejects product writes without catalog.manage but allows reads", async () => {
    const { owner, business } = await createOwner("prod-owner10@kiosk.test");
    const category = await createCategory(owner.id, business.id);
    const employee = await users.create({
      email: "prod-employee10@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      "test-correlation-id",
    );

    await expect(
      products.create(employee.id, business.id, { name: "Cola", categoryId: category.id }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    await expect(products.search(employee.id, business.id, {})).resolves.toBeDefined();
  });
});
