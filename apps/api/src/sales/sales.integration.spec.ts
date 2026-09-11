import "reflect-metadata";
import { Uuidv7Generator } from "@bmp/domain";
import { createTestContext, type TestContext } from "@bmp/domain/testing";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { CategoriesService } from "../catalog/categories.service";
import { ProductsService } from "../catalog/products.service";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PricingService } from "../pricing/pricing.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { isSaleAbandoned, SalesService } from "./sales.service";

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Sale aggregate and state transitions", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let categories: CategoriesService;
  let products: ProductsService;
  let pricing: PricingService;
  let configuration: ConfigurationService;
  let sales: SalesService;
  let testContext: TestContext;

  beforeAll(async () => {
    // A fixed, controllable clock -- abandonment classification is
    // exactly the time-sensitive logic that needs it (same reasoning as
    // expiration-batches.integration.spec.ts's own near-expiration tests).
    testContext = createTestContext(new Date("2026-06-01T00:00:00.000Z"));

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        { provide: CLOCK, useValue: testContext.clock },
        { provide: ID_GENERATOR, useClass: Uuidv7Generator },
        UsersService,
        PasswordHasherService,
        PermissionsService,
        RolesService,
        MembershipsService,
        BusinessesService,
        AuditService,
        CategoriesService,
        ProductsService,
        PricingService,
        ConfigurationService,
        SalesService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    pricing = moduleRef.get(PricingService);
    configuration = moduleRef.get(ConfigurationService);
    sales = moduleRef.get(SalesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    testContext.clock.set(new Date("2026-06-01T00:00:00.000Z"));
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
    await prisma.user.deleteMany();
  });

  async function createOwnerWithPricedProduct(
    emailPrefix: string,
    overrides: { saleMode?: "unit" | "weighted"; weightUnit?: "g" | "kg" } = {},
  ) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Beverages" });
    const product = await products.create(owner.id, business.id, {
      name: "Cola",
      categoryId: category.id,
      saleMode: overrides.saleMode,
      weightUnit: overrides.weightUnit,
    });
    await pricing.upsert(
      owner.id,
      business.id,
      product.id,
      { costPrice: 5000, salePrice: 10000 },
      TEST_CORRELATION_ID,
    );
    return { owner, business, product };
  }

  it("start creates an in_progress sale with one line, the right total, and firstItemAt set to now", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner1");

    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 3 },
      TEST_CORRELATION_ID,
    );

    expect(sale.status).toBe("in_progress");
    expect(sale.total).toBe(30000);
    expect(sale.firstItemAt).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0]).toMatchObject({
      productId: product.id,
      name: "Cola",
      quantity: 3,
      unitCostPrice: 5000,
      unitSalePrice: 10000,
      lineTotal: 30000,
    });

    const events = await prisma.auditEvent.findMany({ where: { businessId: business.id } });
    expect(events.map((event) => event.action)).toContain("sale.started");
  });

  it("rejects starting a sale for a product with no pricing set", async () => {
    const owner = await users.create({
      email: "sale-owner2@kiosk.test",
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Beverages" });
    const product = await products.create(owner.id, business.id, {
      name: "Sin precio",
      categoryId: category.id,
    });

    await expect(
      sales.start(
        owner.id,
        business.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "SALE_PRODUCT_HAS_NO_PRICING" });
  });

  it("computes a weighted line's total as price-per-kg * grams / 1000", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner3", {
      saleMode: "weighted",
      weightUnit: "kg",
    });
    // salePrice 10000 = $100.00/kg; 750g -> $75.00 (7500).

    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 750 },
      TEST_CORRELATION_ID,
    );

    expect(sale.total).toBe(7500);
    expect(sale.lines[0]?.lineTotal).toBe(7500);
  });

  it("addLine merges a repeated unit-mode product into the existing line, keeping its original price snapshot", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner4");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );

    // Pricing changes after the first scan -- the merged line must NOT
    // pick up this new price (same rule as the POS cart).
    await pricing.upsert(
      owner.id,
      business.id,
      product.id,
      { salePrice: 20000 },
      TEST_CORRELATION_ID,
    );

    const updated = await sales.addLine(
      owner.id,
      business.id,
      sale.id,
      { productId: product.id, quantity: 2 },
      TEST_CORRELATION_ID,
    );

    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]).toMatchObject({ quantity: 3, unitSalePrice: 10000, lineTotal: 30000 });
    expect(updated.total).toBe(30000);
  });

  it("addLine gives each weighted-product scan its own line", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner5", {
      saleMode: "weighted",
      weightUnit: "kg",
    });
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 500 },
      TEST_CORRELATION_ID,
    );

    const updated = await sales.addLine(
      owner.id,
      business.id,
      sale.id,
      { productId: product.id, quantity: 300 },
      TEST_CORRELATION_ID,
    );

    expect(updated.lines).toHaveLength(2);
    expect(updated.lines.map((line) => line.quantity)).toEqual([500, 300]);
  });

  it("updateLineQuantity recomputes the line and sale totals", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner6");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );
    const lineId = sale.lines[0]!.id;

    const updated = await sales.updateLineQuantity(
      owner.id,
      business.id,
      sale.id,
      lineId,
      5,
      TEST_CORRELATION_ID,
    );

    expect(updated.lines[0]?.quantity).toBe(5);
    expect(updated.total).toBe(50000);
  });

  it("removeLine removes only the targeted line and recomputes the total, down to zero", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner7");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );
    const lineId = sale.lines[0]!.id;

    const updated = await sales.removeLine(
      owner.id,
      business.id,
      sale.id,
      lineId,
      TEST_CORRELATION_ID,
    );

    expect(updated.lines).toHaveLength(0);
    expect(updated.total).toBe(0);
  });

  it("rejects mutating lines once the sale is no longer in_progress", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner8");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );
    await sales.cancel(owner.id, business.id, sale.id, TEST_CORRELATION_ID);

    await expect(
      sales.addLine(
        owner.id,
        business.id,
        sale.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "SALE_NOT_IN_PROGRESS" });
  });

  it("cancel transitions in_progress to cancelled and rejects a second cancel", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner9");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );

    const cancelled = await sales.cancel(owner.id, business.id, sale.id, TEST_CORRELATION_ID);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).toEqual(new Date("2026-06-01T00:00:00.000Z"));

    await expect(
      sales.cancel(owner.id, business.id, sale.id, TEST_CORRELATION_ID),
    ).rejects.toMatchObject({
      code: "SALE_NOT_IN_PROGRESS",
    });
  });

  it("complete transitions in_progress to completed within the caller's own transaction", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner10");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );

    const completed = await prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id));

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });

  it("rejects completing a sale with no lines", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner11");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );
    await sales.removeLine(owner.id, business.id, sale.id, sale.lines[0]!.id, TEST_CORRELATION_ID);

    await expect(
      prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id)),
    ).rejects.toMatchObject({
      code: "SALE_HAS_NO_LINES",
    });
  });

  it("rejects completing an already-cancelled sale", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner12");
    const sale = await sales.start(
      owner.id,
      business.id,
      { productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );
    await sales.cancel(owner.id, business.id, sale.id, TEST_CORRELATION_ID);

    await expect(
      prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id)),
    ).rejects.toMatchObject({
      code: "SALE_NOT_IN_PROGRESS",
    });
  });

  describe("abandonment (SPECS.md 14.4)", () => {
    it("isSaleAbandoned is false before the threshold and true once past it", () => {
      const sale = {
        status: "in_progress" as const,
        firstItemAt: new Date("2026-06-01T00:00:00.000Z"),
      };
      const justBefore = new Date("2026-06-01T03:59:59.999Z");
      const atThreshold = new Date("2026-06-01T04:00:00.000Z");

      expect(isSaleAbandoned(sale, justBefore, 240)).toBe(false);
      expect(isSaleAbandoned(sale, atThreshold, 240)).toBe(true);
    });

    it("isSaleAbandoned is always false for a non-in_progress sale, regardless of age", () => {
      const sale = {
        status: "completed" as const,
        firstItemAt: new Date("2020-01-01T00:00:00.000Z"),
      };
      expect(isSaleAbandoned(sale, new Date("2026-06-01T00:00:00.000Z"), 240)).toBe(false);
    });

    it("rejects abandoning a sale that has not yet crossed the configured threshold", async () => {
      const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner13");
      const sale = await sales.start(
        owner.id,
        business.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );

      await expect(sales.abandon(business.id, sale.id, TEST_CORRELATION_ID)).rejects.toMatchObject({
        code: "SALE_NOT_ABANDONABLE",
      });
    });

    it("abandons a sale once it has sat in_progress past the business's configured threshold", async () => {
      const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner14");
      await configuration.updateSections(
        owner.id,
        business.id,
        { salePolicy: { abandonmentThresholdMinutes: 30 } },
        TEST_CORRELATION_ID,
      );
      const sale = await sales.start(
        owner.id,
        business.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );

      testContext.clock.advanceMs(31 * 60_000);
      const abandoned = await sales.abandon(business.id, sale.id, TEST_CORRELATION_ID);

      expect(abandoned.status).toBe("abandoned");
      expect(abandoned.abandonedAt).toEqual(new Date("2026-06-01T00:31:00.000Z"));

      const events = await prisma.auditEvent.findMany({
        where: { businessId: business.id, targetId: sale.id },
      });
      expect(events.map((event) => event.action)).toContain("sale.abandoned");
    });

    it("rejects abandoning a sale that already completed", async () => {
      const { owner, business, product } = await createOwnerWithPricedProduct("sale-owner15");
      const sale = await sales.start(
        owner.id,
        business.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );
      await prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id));
      testContext.clock.advanceMs(300 * 60_000);

      await expect(sales.abandon(business.id, sale.id, TEST_CORRELATION_ID)).rejects.toMatchObject({
        code: "SALE_NOT_ABANDONABLE",
      });
    });
  });

  describe("tenancy and authorization", () => {
    it("rejects starting a sale for a product that belongs to a different business", async () => {
      const { product: productA } = await createOwnerWithPricedProduct("sale-tenant-a");
      const { owner: ownerB, business: businessB } =
        await createOwnerWithPricedProduct("sale-tenant-b");

      await expect(
        sales.start(
          ownerB.id,
          businessB.id,
          { productId: productA.id, quantity: 1 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    });

    it("rejects reading a sale scoped to a different business", async () => {
      const { owner, business, product } = await createOwnerWithPricedProduct("sale-tenant-c");
      const sale = await sales.start(
        owner.id,
        business.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );
      const { owner: strangerOwner, business: strangerBusiness } =
        await createOwnerWithPricedProduct("sale-tenant-d");

      await expect(
        sales.findOne(strangerOwner.id, strangerBusiness.id, sale.id),
      ).rejects.toMatchObject({
        code: "SALE_NOT_FOUND",
      });
    });

    it("rejects starting a sale from a member without sales.create", async () => {
      const { owner, business } = await createOwnerWithPricedProduct("sale-perm-owner");
      const employee = await users.create({
        email: "sale-perm-employee@kiosk.test",
        password: "correct-horse-1",
      });
      // A role with no permissions at all -- sales.create is not
      // guaranteed by simply being a member.
      const noPermsRole = await prisma.role.create({
        data: { id: "role-sale-no-perms", businessId: business.id, name: "Sin permisos" },
      });
      await memberships.addMember(
        owner.id,
        business.id,
        { email: employee.email, roleId: noPermsRole.id },
        TEST_CORRELATION_ID,
      );

      await expect(
        sales.start(
          employee.id,
          business.id,
          { productId: "whatever", quantity: 1 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects cancelling a sale from a member without sales.cancel", async () => {
      const { owner, business, product } = await createOwnerWithPricedProduct("sale-perm-owner2");
      const sale = await sales.start(
        owner.id,
        business.id,
        { productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );
      const employee = await users.create({
        email: "sale-perm-employee2@kiosk.test",
        password: "correct-horse-1",
      });
      const employeeRole = await prisma.role.findFirstOrThrow({
        where: { businessId: business.id, name: "Employee" },
      });
      // The seeded Employee role includes sales.create but not
      // sales.cancel (permission-catalog.ts).
      await memberships.addMember(
        owner.id,
        business.id,
        { email: employee.email, roleId: employeeRole.id },
        TEST_CORRELATION_ID,
      );

      await expect(
        sales.cancel(employee.id, business.id, sale.id, TEST_CORRELATION_ID),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });
  });
});
