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
  let memberships: MembershipsService;
  let roles: RolesService;
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
    memberships = moduleRef.get(MembershipsService);
    roles = moduleRef.get(RolesService);
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
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.role.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createOwnerWithProduct(emailPrefix: string, minimumStock?: number) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Beverages" });
    const product = await products.create(owner.id, business.id, {
      name: "Cola",
      categoryId: category.id,
      minimumStock,
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
      reason: "return",
      sourceOperationId: "future-return-record-id",
    });

    const [movement] = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
    });
    expect(movement?.sourceOperationId).toBe("future-return-record-id");
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

  // -- receiveStock / adjustStock / recordLoss commands --------------------

  async function addMemberWithRole(
    ownerId: string,
    businessId: string,
    roleName: string,
    email: string,
  ) {
    const role = await prisma.role.findFirstOrThrow({ where: { businessId, name: roleName } });
    const member = await users.create({ email, password: "correct-horse-1" });
    await memberships.addMember(
      ownerId,
      businessId,
      { email, roleId: role.id },
      TEST_CORRELATION_ID,
    );
    return member;
  }

  it("receiveStock increases stock, audits the operation, and defaults sourceOperationId to null", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-recv1");

    const result = await inventory.receiveStock(
      owner.id,
      business.id,
      product.id,
      { quantity: 30 },
      TEST_CORRELATION_ID,
    );

    expect(result.movement).toMatchObject({ reason: "receiving", quantity: 30 });
    expect(result.stock.quantityOnHand).toBe(30);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { targetType: "inventory_movement", targetId: result.movement.id },
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: "inventory_movement.received",
      actorUserId: owner.id,
      correlationId: TEST_CORRELATION_ID,
    });
  });

  it("receiveStock rejects a non-positive quantity", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-recv2");

    await expect(
      inventory.receiveStock(
        owner.id,
        business.id,
        product.id,
        { quantity: 0 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RECEIVING_QUANTITY" });
    await expect(
      inventory.receiveStock(
        owner.id,
        business.id,
        product.id,
        { quantity: -5 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RECEIVING_QUANTITY" });
  });

  it("rejects receiveStock/adjustStock for an Employee (needs inventory.adjust)", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-recv3");
    const employee = await addMemberWithRole(
      owner.id,
      business.id,
      "Employee",
      "inv-recv3-employee@kiosk.test",
    );

    await expect(
      inventory.receiveStock(
        employee.id,
        business.id,
        product.id,
        { quantity: 10 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(
      inventory.adjustStock(
        employee.id,
        business.id,
        product.id,
        { quantity: 10 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("lets a Manager receive stock (inventory.adjust) without owning the whole business", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-recv4");
    const manager = await addMemberWithRole(
      owner.id,
      business.id,
      "Manager",
      "inv-recv4-manager@kiosk.test",
    );

    const result = await inventory.receiveStock(
      manager.id,
      business.id,
      product.id,
      { quantity: 15 },
      TEST_CORRELATION_ID,
    );
    expect(result.stock.quantityOnHand).toBe(15);
  });

  it("adjustStock records a signed correction and audits it", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-adj1");
    await inventory.receiveStock(
      owner.id,
      business.id,
      product.id,
      { quantity: 20 },
      TEST_CORRELATION_ID,
    );

    const result = await inventory.adjustStock(
      owner.id,
      business.id,
      product.id,
      { quantity: -3 },
      TEST_CORRELATION_ID,
    );

    expect(result.movement).toMatchObject({ reason: "manual_adjustment", quantity: -3 });
    expect(result.stock.quantityOnHand).toBe(17);
    const auditEvents = await prisma.auditEvent.findMany({
      where: { targetType: "inventory_movement", targetId: result.movement.id },
    });
    expect(auditEvents[0]).toMatchObject({ action: "inventory_movement.adjusted" });
  });

  it("adjustStock rejects a zero quantity", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-adj2");

    await expect(
      inventory.adjustStock(
        owner.id,
        business.id,
        product.id,
        { quantity: 0 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INVENTORY_MOVEMENT_QUANTITY" });
  });

  it("recordLoss stores a positive input as a negative movement, with the configured loss reason, and audits it", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-loss1");
    await inventory.receiveStock(
      owner.id,
      business.id,
      product.id,
      { quantity: 50 },
      TEST_CORRELATION_ID,
    );

    const result = await inventory.recordLoss(
      owner.id,
      business.id,
      product.id,
      { quantity: 4, lossReason: "theft" },
      TEST_CORRELATION_ID,
    );

    expect(result.movement).toMatchObject({
      reason: "loss",
      quantity: -4,
      lossReason: "theft",
    });
    expect(result.stock.quantityOnHand).toBe(46);
    const auditEvents = await prisma.auditEvent.findMany({
      where: { targetType: "inventory_movement", targetId: result.movement.id },
    });
    expect(auditEvents[0]).toMatchObject({ action: "inventory_movement.loss_recorded" });
  });

  it("recordLoss rejects a non-positive quantity", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-loss2");

    await expect(
      inventory.recordLoss(
        owner.id,
        business.id,
        product.id,
        { quantity: 0, lossReason: "other" },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "INVALID_LOSS_QUANTITY" });
  });

  it("rejects recordLoss for a Manager who lacks inventory.record_loss (distinct from inventory.adjust)", async () => {
    // Manager has inventory.adjust AND inventory.record_loss by default
    // (permission-catalog.ts) -- use a custom role that grants only
    // inventory.adjust to prove the two permissions are checked
    // independently, not treated as equivalent.
    const { owner, business, product } = await createOwnerWithProduct("inv-loss3");
    const customRole = await roles.createCustomRole(
      owner.id,
      business.id,
      { name: "Stock clerk", permissionCodes: ["inventory.adjust"] },
      TEST_CORRELATION_ID,
    );
    const clerk = await users.create({
      email: "inv-loss3-clerk@kiosk.test",
      password: "correct-horse-1",
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: clerk.email, roleId: customRole.id },
      TEST_CORRELATION_ID,
    );

    await expect(
      inventory.recordLoss(
        clerk.id,
        business.id,
        product.id,
        { quantity: 1, lossReason: "other" },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    // But the same clerk CAN adjust, since they do have inventory.adjust.
    const adjusted = await inventory.adjustStock(
      clerk.id,
      business.id,
      product.id,
      { quantity: 5 },
      TEST_CORRELATION_ID,
    );
    expect(adjusted.stock.quantityOnHand).toBe(5);
  });

  it("rejects a loss movement without a lossReason, and a non-loss movement that carries one", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-loss4");

    await expect(
      recordMovement(business.id, product.id, owner.id, -1, { reason: "loss" }),
    ).rejects.toMatchObject({ code: "INVENTORY_LOSS_REASON_REQUIRED" });

    await expect(
      recordMovement(business.id, product.id, owner.id, 1, {
        reason: "receiving",
        lossReason: "other",
      }),
    ).rejects.toMatchObject({ code: "INVENTORY_LOSS_REASON_NOT_ALLOWED" });
  });

  // -- listStockAlerts -----------------------------------------------------

  it("flags negative stock unconditionally, even without a configured minimumStock", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-alert1");
    await inventory.adjustStock(
      owner.id,
      business.id,
      product.id,
      { quantity: -3 },
      TEST_CORRELATION_ID,
    );

    const alerts = await inventory.listStockAlerts(owner.id, business.id);

    expect(alerts).toEqual([
      {
        productId: product.id,
        productName: product.name,
        quantityOnHand: -3,
        minimumStock: null,
        negative: true,
        lowStock: false,
      },
    ]);
  });

  it("flags a product at or below its configured minimumStock, even at zero (no movement yet)", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-alert2", 10);

    const alerts = await inventory.listStockAlerts(owner.id, business.id);

    expect(alerts).toEqual([
      {
        productId: product.id,
        productName: product.name,
        quantityOnHand: 0,
        minimumStock: 10,
        negative: false,
        lowStock: true,
      },
    ]);
  });

  it("does not flag a product with sufficient stock above its minimum", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-alert3", 10);
    await inventory.receiveStock(
      owner.id,
      business.id,
      product.id,
      { quantity: 50 },
      TEST_CORRELATION_ID,
    );

    const alerts = await inventory.listStockAlerts(owner.id, business.id);

    expect(alerts).toEqual([]);
  });

  it("reports both flags once for a product that is both negative and below its minimum", async () => {
    const { owner, business, product } = await createOwnerWithProduct("inv-alert4", 5);
    await inventory.adjustStock(
      owner.id,
      business.id,
      product.id,
      { quantity: -2 },
      TEST_CORRELATION_ID,
    );

    const alerts = await inventory.listStockAlerts(owner.id, business.id);

    expect(alerts).toEqual([
      {
        productId: product.id,
        productName: product.name,
        quantityOnHand: -2,
        minimumStock: 5,
        negative: true,
        lowStock: true,
      },
    ]);
  });

  it("scopes alerts to one business only", async () => {
    const {
      owner: ownerA,
      business: businessA,
      product: productA,
    } = await createOwnerWithProduct("inv-alert5a", 10);
    await createOwnerWithProduct("inv-alert5b", 10);

    const alerts = await inventory.listStockAlerts(ownerA.id, businessA.id);

    expect(alerts.map((alert) => alert.productId)).toEqual([productA.id]);
  });

  it("rejects a caller with no membership in the business", async () => {
    const { business } = await createOwnerWithProduct("inv-alert6", 10);
    const stranger = await users.create({
      email: "inv-alert6-stranger@kiosk.test",
      password: "correct-horse-1",
    });

    await expect(inventory.listStockAlerts(stranger.id, business.id)).rejects.toMatchObject({
      code: "MEMBERSHIP_NOT_FOUND",
    });
  });
});
