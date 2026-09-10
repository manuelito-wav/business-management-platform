import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { CategoriesService } from "../catalog/categories.service";
import { ProductsService } from "../catalog/products.service";
import { domainProviders } from "../common/domain-providers";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "./inventory.service";

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Inventory ledger and stock projection", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let categories: CategoriesService;
  let products: ProductsService;
  let inventory: InventoryService;

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
        InventoryService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    inventory = moduleRef.get(InventoryService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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

  function recordMovement(
    businessId: string,
    productId: string,
    actorUserId: string,
    quantity: number,
    overrides: Partial<Parameters<InventoryService["recordMovement"]>[1]> = {},
  ) {
    return prisma.$transaction((tx) =>
      inventory.recordMovement(tx, {
        businessId,
        productId,
        actorUserId,
        quantity,
        reason: "receiving",
        correlationId: TEST_CORRELATION_ID,
        ...overrides,
      }),
    );
  }

  // -- recordMovement: the ledger + transactional projection --------------

  it("creates a ledger row and a fresh stock projection on the first movement", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner1");

    await recordMovement(business.id, product.id, owner.id, 50);

    const movements = await prisma.inventoryMovement.findMany({ where: { productId: product.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      businessId: business.id,
      productId: product.id,
      reason: "receiving",
      quantity: 50,
      actorUserId: owner.id,
      correlationId: TEST_CORRELATION_ID,
      sourceOperationId: null,
    });

    const stock = await inventory.getStock(owner.id, business.id, product.id);
    expect(stock.quantityOnHand).toBe(50);
  });

  it("increments the existing projection on subsequent movements, positive and negative", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner2");

    await recordMovement(business.id, product.id, owner.id, 100, { reason: "receiving" });
    await recordMovement(business.id, product.id, owner.id, -30, { reason: "sale" });
    await recordMovement(business.id, product.id, owner.id, 5, { reason: "manual_adjustment" });

    const stock = await inventory.getStock(owner.id, business.id, product.id);
    expect(stock.quantityOnHand).toBe(75);

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(movements).toHaveLength(3);
  });

  it("allows stock to go negative (D-015/SPECS.md 8.2) rather than rejecting the movement", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner3");

    await recordMovement(business.id, product.id, owner.id, -1, { reason: "sale" });

    const stock = await inventory.getStock(owner.id, business.id, product.id);
    expect(stock.quantityOnHand).toBe(-1);
  });

  it("rejects a zero-quantity movement", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner4");

    await expect(recordMovement(business.id, product.id, owner.id, 0)).rejects.toMatchObject({
      code: "INVALID_INVENTORY_MOVEMENT_QUANTITY",
    });
  });

  it("rejects a movement for a product belonging to a different business (tenant isolation)", async () => {
    const { owner, business: businessA } = await createOwnerWithProduct("inv-owner5a");
    const { product: productB } = await createOwnerWithProduct("inv-owner5b");

    await expect(recordMovement(businessA.id, productB.id, owner.id, 10)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });

    // Nothing was written for either the ledger or the projection.
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.productStock.count()).toBe(0);
  });

  it("writes nothing when the caller's own transaction rolls back after recordMovement", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner6");

    await expect(
      prisma.$transaction(async (tx) => {
        await inventory.recordMovement(tx, {
          businessId: business.id,
          productId: product.id,
          actorUserId: owner.id,
          quantity: 40,
          reason: "receiving",
          correlationId: TEST_CORRELATION_ID,
        });
        throw new Error("simulated failure of a later fact in the same transaction");
      }),
    ).rejects.toThrow("simulated failure");

    // Atomic: neither the ledger row nor the projection update survived.
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.productStock.count()).toBe(0);
  });

  it("records an optional sourceOperationId as a plain, unvalidated reference", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner7");

    await recordMovement(business.id, product.id, owner.id, 12, {
      reason: "loss",
      sourceOperationId: "future-loss-record-id",
    });

    const [movement] = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
    });
    expect(movement?.sourceOperationId).toBe("future-loss-record-id");
  });

  // -- getStock -------------------------------------------------------------

  it("reports zero stock for a product with no recorded movements yet", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner8");

    const stock = await inventory.getStock(owner.id, business.id, product.id);

    expect(stock).toEqual({ productId: product.id, quantityOnHand: 0, updatedAt: null });
  });

  it("rejects a caller with no membership in the business", async () => {
    const { business, product } = await createOwnerWithProduct("inv-owner9");
    const stranger = await users.create({
      email: "stranger9@kiosk.test",
      password: "correct-horse-1",
    });

    await expect(inventory.getStock(stranger.id, business.id, product.id)).rejects.toMatchObject({
      code: "MEMBERSHIP_NOT_FOUND",
    });
  });

  it("rejects a product that does not belong to the business", async () => {
    const { owner, business: businessA } = await createOwnerWithProduct("inv-owner10a");
    const { product: productB } = await createOwnerWithProduct("inv-owner10b");

    await expect(inventory.getStock(owner.id, businessA.id, productB.id)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
  });

  // -- reconcileStock ---------------------------------------------------------

  it("reconcileStock recomputes the projection to exactly match the ledger sum", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-owner11");
    await recordMovement(business.id, product.id, owner.id, 20, { reason: "receiving" });
    await recordMovement(business.id, product.id, owner.id, -8, { reason: "sale" });

    // Simulate drift: something (a bug, a manual DB edit) desynchronized
    // the projection from the ledger.
    await prisma.productStock.updateMany({
      where: { productId: product.id },
      data: { quantityOnHand: 9999 },
    });

    const reconciled = await inventory.reconcileStock(business.id, product.id);

    expect(reconciled.quantityOnHand).toBe(12);
    const stock = await inventory.getStock(owner.id, business.id, product.id);
    expect(stock.quantityOnHand).toBe(12);
  });

  it("reconcileStock creates the projection row from an empty ledger as zero", async () => {
    const { business, product } = await createOwnerWithProduct("inv-owner12");

    const reconciled = await inventory.reconcileStock(business.id, product.id);

    expect(reconciled.quantityOnHand).toBe(0);
  });

  it("reconcileStock rejects a product that does not belong to the business", async () => {
    const { business: businessA } = await createOwnerWithProduct("inv-owner13a");
    const { product: productB } = await createOwnerWithProduct("inv-owner13b");

    await expect(inventory.reconcileStock(businessA.id, productB.id)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
  });
});
