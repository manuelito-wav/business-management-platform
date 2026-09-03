import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { CategoriesService } from "../catalog/categories.service";
import { ProductsService } from "../catalog/products.service";
import { domainProviders } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { FEATURE_FLAGS_DEFAULT } from "../configuration/sections/feature-flags.config";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { PriceListsService } from "./price-lists.service";
import { PricingService } from "./pricing.service";

describe("Price lists", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let categories: CategoriesService;
  let products: ProductsService;
  let pricing: PricingService;
  let priceLists: PriceListsService;
  let configuration: ConfigurationService;

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
        PriceListsService,
        ConfigurationService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    pricing = moduleRef.get(PricingService);
    priceLists = moduleRef.get(PriceListsService);
    configuration = moduleRef.get(ConfigurationService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
    await prisma.user.deleteMany();
  });

  async function createOwnerWithPricedProduct(emailPrefix: string) {
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
    await pricing.upsert(
      owner.id,
      business.id,
      product.id,
      { costPrice: 5000, salePrice: 10000 },
      "test-correlation-id",
    );
    return { owner, business, product };
  }

  async function enablePriceLists(actingUserId: string, businessId: string) {
    await configuration.updateSections(
      actingUserId,
      businessId,
      { featureFlags: { ...FEATURE_FLAGS_DEFAULT, priceLists: true } },
      "test-correlation-id",
    );
  }

  function create(actingUserId: string, businessId: string, name: string) {
    return priceLists.create(actingUserId, businessId, { name }, "test-correlation-id");
  }

  // -- Feature gate ---------------------------------------------------------

  it("rejects creating a price list while the business has not enabled the feature", async () => {
    const { owner, business } = await createOwnerWithPricedProduct("pl-owner1");

    await expect(create(owner.id, business.id, "Wholesale")).rejects.toMatchObject({
      code: "PRICE_LISTS_DISABLED",
    });
  });

  it("creates a price list once the business enables featureFlags.priceLists", async () => {
    const { owner, business } = await createOwnerWithPricedProduct("pl-owner2");
    await enablePriceLists(owner.id, business.id);

    const list = await create(owner.id, business.id, "Wholesale");

    expect(list.name).toBe("Wholesale");
    expect(list.status).toBe("active");
  });

  it("rejects a duplicate price list name in the same business", async () => {
    const { owner, business } = await createOwnerWithPricedProduct("pl-owner3");
    await enablePriceLists(owner.id, business.id);
    await create(owner.id, business.id, "Wholesale");

    await expect(create(owner.id, business.id, "Wholesale")).rejects.toMatchObject({
      code: "PRICE_LIST_NAME_ALREADY_EXISTS",
    });
  });

  it("lists price lists alphabetically", async () => {
    const { owner, business } = await createOwnerWithPricedProduct("pl-owner4");
    await enablePriceLists(owner.id, business.id);
    await create(owner.id, business.id, "Wholesale");
    await create(owner.id, business.id, "Employee");

    const list = await priceLists.list(owner.id, business.id);
    expect(list.map((priceList) => priceList.name)).toEqual(["Employee", "Wholesale"]);
  });

  it("updates a price list's name and status", async () => {
    const { owner, business } = await createOwnerWithPricedProduct("pl-owner5");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");

    const updated = await priceLists.update(
      owner.id,
      business.id,
      list.id,
      { status: "inactive" },
      "test-correlation-id",
    );

    expect(updated.status).toBe("inactive");
    expect(updated.name).toBe("Wholesale");
  });

  // -- Entries ----------------------------------------------------------------

  it("sets and overwrites an override price for a product", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner6");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");

    const entry = await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 8000 },
      "test-correlation-id",
    );
    expect(entry.salePrice).toBe(8000);

    const updated = await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 7500 },
      "test-correlation-id",
    );
    expect(updated.id).toBe(entry.id);
    expect(updated.salePrice).toBe(7500);
  });

  it("removes an override price", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner7");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");
    await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 8000 },
      "test-correlation-id",
    );

    await priceLists.removeEntry(owner.id, business.id, list.id, product.id, "test-correlation-id");

    await expect(
      priceLists.removeEntry(owner.id, business.id, list.id, product.id, "test-correlation-id"),
    ).rejects.toMatchObject({ code: "PRICE_LIST_ENTRY_NOT_FOUND" });
  });

  it("records audit events for price list and entry writes", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner8");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");
    await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 8000 },
      "test-correlation-id",
    );

    const events = await prisma.auditEvent.findMany({
      where: { businessId: business.id, targetType: { in: ["price_list", "price_list_entry"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual([
      "price_list.created",
      "price_list_entry.created",
    ]);
  });

  // -- The selection boundary: resolveEffectivePrice -------------------------

  it("falls back to the default sale price when no price list is given", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner9");

    const resolved = await priceLists.resolveEffectivePrice(owner.id, business.id, product.id);

    expect(resolved).toEqual({ salePrice: 10000, source: "default", priceListId: null });
  });

  it("returns the price-list override once the feature is enabled and an entry exists", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner10");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");
    await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 8000 },
      "test-correlation-id",
    );

    const resolved = await priceLists.resolveEffectivePrice(
      owner.id,
      business.id,
      product.id,
      list.id,
    );

    expect(resolved).toEqual({ salePrice: 8000, source: "price_list", priceListId: list.id });
  });

  it("falls back to the default price when the feature is disabled, even with an existing entry", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner11");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");
    await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 8000 },
      "test-correlation-id",
    );
    // Disable the feature again -- a supplied priceListId must then have no effect.
    await configuration.updateSections(
      owner.id,
      business.id,
      { featureFlags: FEATURE_FLAGS_DEFAULT },
      "test-correlation-id",
    );

    const resolved = await priceLists.resolveEffectivePrice(
      owner.id,
      business.id,
      product.id,
      list.id,
    );

    expect(resolved).toEqual({ salePrice: 10000, source: "default", priceListId: null });
  });

  it("falls back to the default price when the list has no override entry for this product", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner12");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");

    const resolved = await priceLists.resolveEffectivePrice(
      owner.id,
      business.id,
      product.id,
      list.id,
    );

    expect(resolved).toEqual({ salePrice: 10000, source: "default", priceListId: null });
  });

  it("falls back to the default price when the price list is inactive", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner13");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");
    await priceLists.setEntry(
      owner.id,
      business.id,
      list.id,
      product.id,
      { salePrice: 8000 },
      "test-correlation-id",
    );
    await priceLists.update(
      owner.id,
      business.id,
      list.id,
      { status: "inactive" },
      "test-correlation-id",
    );

    const resolved = await priceLists.resolveEffectivePrice(
      owner.id,
      business.id,
      product.id,
      list.id,
    );

    expect(resolved).toEqual({ salePrice: 10000, source: "default", priceListId: null });
  });

  it("rejects an explicit priceListId that does not exist in this business", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner14");
    await enablePriceLists(owner.id, business.id);

    await expect(
      priceLists.resolveEffectivePrice(owner.id, business.id, product.id, "not-a-real-id"),
    ).rejects.toMatchObject({ code: "PRICE_LIST_NOT_FOUND" });
  });

  it("rejects resolving a price for a product with no default pricing set", async () => {
    const owner = await users.create({
      email: "pl-owner15@kiosk.test",
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Beverages" });
    const product = await products.create(owner.id, business.id, {
      name: "Cola",
      categoryId: category.id,
    });

    await expect(
      priceLists.resolveEffectivePrice(owner.id, business.id, product.id),
    ).rejects.toMatchObject({ code: "PRODUCT_PRICING_NOT_FOUND" });
  });

  // -- Tenant isolation and authorization -------------------------------------

  it("rejects a price list belonging to a different business", async () => {
    const { owner: ownerA, business: businessA } =
      await createOwnerWithPricedProduct("pl-owner16a");
    const { owner: ownerB, business: businessB } =
      await createOwnerWithPricedProduct("pl-owner16b");
    await enablePriceLists(ownerA.id, businessA.id);
    await enablePriceLists(ownerB.id, businessB.id);
    const listA = await create(ownerA.id, businessA.id, "Wholesale");

    await expect(
      priceLists.update(
        ownerB.id,
        businessB.id,
        listA.id,
        { status: "inactive" },
        "test-correlation-id",
      ),
    ).rejects.toMatchObject({ code: "PRICE_LIST_NOT_FOUND" });
  });

  it("rejects writes without pricing.manage but allows reads", async () => {
    const { owner, business, product } = await createOwnerWithPricedProduct("pl-owner17");
    await enablePriceLists(owner.id, business.id);
    const list = await create(owner.id, business.id, "Wholesale");

    const employee = await users.create({
      email: "pl-employee17@kiosk.test",
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

    await expect(create(employee.id, business.id, "Retail")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    await expect(priceLists.list(employee.id, business.id)).resolves.toBeDefined();
    await expect(
      priceLists.resolveEffectivePrice(employee.id, business.id, product.id, list.id),
    ).resolves.toBeDefined();
  });
});
