import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { CategoriesService } from "../catalog/categories.service";
import { ProductsService } from "../catalog/products.service";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PricingService } from "./pricing.service";

describe("Product pricing", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let categories: CategoriesService;
  let products: ProductsService;
  let pricing: PricingService;

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
        PricingService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    pricing = moduleRef.get(PricingService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
    await prisma.user.deleteMany();
  });

  async function createOwnerWithProduct(emailPrefix: string) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Beverages" });
    const product = await products.create(owner.id, business.id, {
      name: "Cola",
      categoryId: category.id,
    });
    return { owner, business, product };
  }

  function upsertPricing(
    actingUserId: string,
    businessId: string,
    productId: string,
    dto: Parameters<PricingService["upsert"]>[3],
  ) {
    return pricing.upsert(actingUserId, businessId, productId, dto, "test-correlation-id");
  }

  // -- Creation (first-time upsert) ---------------------------------------

  it("creates pricing via sale-price mode", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner1");

    const result = await upsertPricing(owner.id, business.id, product.id, {
      costPrice: 5000,
      salePrice: 10000,
    });

    expect(result.costPrice).toBe(5000);
    expect(result.salePrice).toBe(10000);
    expect(result.profit).toBe(5000);
    expect(result.marginPercentBasisPoints).toBe(10000); // 100.00%
    expect(result.inputMode).toBe("sale_price");
  });

  it("creates pricing via target-profit mode", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner2");

    const result = await upsertPricing(owner.id, business.id, product.id, {
      costPrice: 5000,
      profit: 2500,
    });

    expect(result.salePrice).toBe(7500);
    expect(result.marginPercentBasisPoints).toBe(5000); // 50.00%
    expect(result.inputMode).toBe("profit");
  });

  it("creates pricing via target-Margin-% mode", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner3");

    const result = await upsertPricing(owner.id, business.id, product.id, {
      costPrice: 5000,
      marginPercentBasisPoints: 10000, // target 100.00%
    });

    expect(result.salePrice).toBe(10000);
    expect(result.profit).toBe(5000);
    expect(result.inputMode).toBe("margin_percent");
  });

  it("rejects creation without costPrice", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner4");

    await expect(
      upsertPricing(owner.id, business.id, product.id, { salePrice: 10000 }),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_INITIAL_VALUES_REQUIRED" });
  });

  it("rejects creation without any of salePrice/profit/marginPercentBasisPoints", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner5");

    await expect(
      upsertPricing(owner.id, business.id, product.id, { costPrice: 5000 }),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_INITIAL_VALUES_REQUIRED" });
  });

  it("rejects supplying more than one of salePrice/profit/marginPercentBasisPoints in one call", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner6");

    await expect(
      upsertPricing(owner.id, business.id, product.id, {
        costPrice: 5000,
        salePrice: 10000,
        profit: 2500,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_AMBIGUOUS_DRIVER" });
  });

  // -- D-032: zero-cost Margin % --------------------------------------------

  it("allows sale-price and profit modes at costPrice 0, with a null (not zero) Margin %", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner7");

    const result = await upsertPricing(owner.id, business.id, product.id, {
      costPrice: 0,
      salePrice: 500,
    });

    expect(result.profit).toBe(500);
    expect(result.marginPercentBasisPoints).toBeNull();
  });

  it("rejects target-Margin-% mode while costPrice is 0", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner8");

    await expect(
      upsertPricing(owner.id, business.id, product.id, {
        costPrice: 0,
        marginPercentBasisPoints: 5000,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_MARGIN_UNDEFINED_AT_ZERO_COST" });
  });

  // -- Updates (D-007 synchronization) -------------------------------------

  it("updating sale price recalculates profit and Margin %", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner9");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    const updated = await upsertPricing(owner.id, business.id, product.id, { salePrice: 10000 });

    expect(updated.costPrice).toBe(5000);
    expect(updated.profit).toBe(5000);
    expect(updated.marginPercentBasisPoints).toBe(10000);
    expect(updated.inputMode).toBe("sale_price");
  });

  it("updating profit recalculates sale price and Margin %", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner10");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    const updated = await upsertPricing(owner.id, business.id, product.id, { profit: 5000 });

    expect(updated.salePrice).toBe(10000);
    expect(updated.marginPercentBasisPoints).toBe(10000);
    expect(updated.inputMode).toBe("profit");
  });

  it("updating Margin % recalculates sale price and profit", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner11");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    const updated = await upsertPricing(owner.id, business.id, product.id, {
      marginPercentBasisPoints: 10000,
    });

    expect(updated.salePrice).toBe(10000);
    expect(updated.profit).toBe(5000);
    expect(updated.inputMode).toBe("margin_percent");
  });

  it("re-derives a Margin % update's stored value from the rounded sale price, staying self-consistent", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner12");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 3, salePrice: 3 });

    // Target 33.33% against cost 3 cannot be hit exactly in whole minor units.
    const updated = await upsertPricing(owner.id, business.id, product.id, {
      marginPercentBasisPoints: 3333,
    });

    expect(updated.profit).toBe(updated.salePrice - updated.costPrice);
    // The stored Margin % must reconcile exactly with the stored cost/sale
    // price pair, even though it may differ from the 3333 request by a
    // fraction of a basis point after rounding the sale price.
    const rounded = Math.round(
      ((updated.salePrice - updated.costPrice) / updated.costPrice) * 10000,
    );
    expect(updated.marginPercentBasisPoints).toBe(rounded);
  });

  it("a cost-only update preserves the sale price and leaves inputMode unchanged", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner13");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, profit: 5000 });

    const updated = await upsertPricing(owner.id, business.id, product.id, { costPrice: 6000 });

    expect(updated.costPrice).toBe(6000);
    expect(updated.salePrice).toBe(10000); // preserved (D-007)
    expect(updated.profit).toBe(4000); // recalculated
    expect(updated.marginPercentBasisPoints).not.toBeNull();
    expect(updated.inputMode).toBe("profit"); // unchanged by the cost-only update
  });

  it("a cost change down to 0 preserves sale price and nulls Margin %, never zero", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner14");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 10000 });

    const updated = await upsertPricing(owner.id, business.id, product.id, { costPrice: 0 });

    expect(updated.salePrice).toBe(10000);
    expect(updated.profit).toBe(10000);
    expect(updated.marginPercentBasisPoints).toBeNull();
  });

  it("rejects combining costPrice with a target value in the same update", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner15");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    await expect(
      upsertPricing(owner.id, business.id, product.id, { costPrice: 6000, salePrice: 9000 }),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_AMBIGUOUS_UPDATE" });
  });

  it("rejects an update with neither costPrice nor a target value", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner16");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    await expect(upsertPricing(owner.id, business.id, product.id, {})).rejects.toMatchObject({
      code: "PRODUCT_PRICING_EMPTY_UPDATE",
    });
  });

  it("rejects a target profit/Margin % that would resolve to a negative sale price", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner17");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 1000, salePrice: 1500 });

    await expect(
      upsertPricing(owner.id, business.id, product.id, { profit: -2000 }),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_INVALID_SALE_PRICE" });
  });

  // -- Auditing (D-042: pricing is server-managed configuration) ------------

  it("records an audit event when pricing is created", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner21");

    const created = await upsertPricing(owner.id, business.id, product.id, {
      costPrice: 5000,
      salePrice: 10000,
    });

    const events = await prisma.auditEvent.findMany({ where: { businessId: business.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "product_pricing.created",
      targetType: "product_pricing",
      targetId: created.id,
      actorUserId: owner.id,
      beforeData: null,
    });
    expect(events[0]?.afterData).toMatchObject({ costPrice: 5000, salePrice: 10000 });
  });

  it("records an audit event with before/after values when pricing is updated", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner22");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    await upsertPricing(owner.id, business.id, product.id, { salePrice: 10000 });

    const events = await prisma.auditEvent.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ action: "product_pricing.updated" });
    expect(events[1]?.beforeData).toMatchObject({ salePrice: 7500 });
    expect(events[1]?.afterData).toMatchObject({ salePrice: 10000 });
  });

  // -- Reads ----------------------------------------------------------------

  it("returns 404 when reading pricing that has not been set yet", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner18");

    await expect(pricing.findOne(owner.id, business.id, product.id)).rejects.toMatchObject({
      code: "PRODUCT_PRICING_NOT_FOUND",
    });
  });

  it("returns 404 for a product that does not belong to this business", async () => {
    const { owner, business } = await createOwnerWithProduct("pricing-owner19a");
    const { product: foreignProduct } = await createOwnerWithProduct("pricing-owner19b");

    await expect(pricing.findOne(owner.id, business.id, foreignProduct.id)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
  });

  // -- Authorization ----------------------------------------------------------

  it("rejects setting pricing without pricing.manage but allows reading it", async () => {
    const { owner, business, product } = await createOwnerWithProduct("pricing-owner20");
    await upsertPricing(owner.id, business.id, product.id, { costPrice: 5000, salePrice: 7500 });

    const employee = await users.create({
      email: "pricing-employee20@kiosk.test",
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
      upsertPricing(employee.id, business.id, product.id, { salePrice: 9000 }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    await expect(pricing.findOne(employee.id, business.id, product.id)).resolves.toMatchObject({
      salePrice: 7500,
    });
  });
});
