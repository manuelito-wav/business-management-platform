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
import { FEATURE_FLAGS_DEFAULT } from "../configuration/sections/feature-flags.config";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ExpirationBatchesService } from "./expiration-batches.service";
import { InventoryService } from "./inventory.service";

const TEST_CORRELATION_ID = "test-correlation-id";

/**
 * ROADMAP.md Phase 3's closing gate: "Verify stock projection repair/
 * rebuild and tenant isolation with integration tests before any sale
 * can create movements, including that expiration alerts alone never
 * create a movement or change stock." Consolidates and extends coverage
 * that individual feature checkpoints already exercised piecemeal, as
 * one explicit, purpose-named proof ahead of Phase 4's sale settlement
 * (the first feature to write inventory movements at real volume).
 */
describe("Inventory ledger: projection repair and tenant isolation (Phase 3 gate)", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let categories: CategoriesService;
  let products: ProductsService;
  let configuration: ConfigurationService;
  let inventory: InventoryService;
  let expirationBatches: ExpirationBatchesService;
  let testContext: TestContext;

  beforeAll(async () => {
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
        ConfigurationService,
        InventoryService,
        ExpirationBatchesService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    configuration = moduleRef.get(ConfigurationService);
    inventory = moduleRef.get(InventoryService);
    expirationBatches = moduleRef.get(ExpirationBatchesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    testContext.clock.set(new Date("2026-06-01T00:00:00.000Z"));
    await prisma.productExpirationBatch.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productStock.deleteMany();
    await prisma.productPricing.deleteMany();
    await prisma.productIdentifier.deleteMany();
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
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

  async function createOwnerWithProduct(
    emailPrefix: string,
    options: { expirationTrackingEnabled?: boolean } = {},
  ) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: `Kiosco ${emailPrefix}` });
    const category = await categories.create(owner.id, business.id, { name: "General" });
    const product = await products.create(owner.id, business.id, {
      name: "Widget",
      categoryId: category.id,
      expirationTrackingEnabled: options.expirationTrackingEnabled ?? false,
    });
    if (options.expirationTrackingEnabled) {
      await configuration.updateSections(
        owner.id,
        business.id,
        { featureFlags: { ...FEATURE_FLAGS_DEFAULT, expirationTracking: true } },
        TEST_CORRELATION_ID,
      );
    }
    return { owner, business, product };
  }

  // -- Stock projection repair/rebuild --------------------------------------

  describe("reconcileStock: repair/rebuild", () => {
    it("recomputes the exact sum across a realistic mixed-reason history (receiving, sale, adjustment, loss)", async () => {
      const { owner, business, product } = await createOwnerWithProduct("gate-recon1");

      await inventory.receiveStock(
        owner.id,
        business.id,
        product.id,
        { quantity: 100 },
        TEST_CORRELATION_ID,
      );
      await inventory.adjustStock(
        owner.id,
        business.id,
        product.id,
        { quantity: -5 },
        TEST_CORRELATION_ID,
      );
      await inventory.recordLoss(
        owner.id,
        business.id,
        product.id,
        { quantity: 8, lossReason: "damage" },
        TEST_CORRELATION_ID,
      );
      await inventory.adjustStock(
        owner.id,
        business.id,
        product.id,
        { quantity: 20 },
        TEST_CORRELATION_ID,
      );
      // 100 - 5 - 8 + 20 = 107.

      const reconciled = await inventory.reconcileStock(business.id, product.id);

      expect(reconciled.quantityOnHand).toBe(107);
      const stock = await inventory.getStock(owner.id, business.id, product.id);
      expect(stock.quantityOnHand).toBe(107);
    });

    it("repairs a fully-missing projection row (not just a drifted one), recreating it from the ledger alone", async () => {
      const { owner, business, product } = await createOwnerWithProduct("gate-recon2");
      await inventory.receiveStock(
        owner.id,
        business.id,
        product.id,
        { quantity: 40 },
        TEST_CORRELATION_ID,
      );
      await inventory.recordLoss(
        owner.id,
        business.id,
        product.id,
        { quantity: 15, lossReason: "theft" },
        TEST_CORRELATION_ID,
      );

      // Simulate a lost/corrupted projection row entirely, not merely a
      // wrong value -- e.g. an operational mistake, not just drift.
      await prisma.productStock.deleteMany({ where: { productId: product.id } });
      expect(await prisma.productStock.count()).toBe(0);

      const reconciled = await inventory.reconcileStock(business.id, product.id);

      expect(reconciled.quantityOnHand).toBe(25);
      expect(await prisma.productStock.count()).toBe(1);
    });

    it("is idempotent: reconciling an already-correct projection changes nothing", async () => {
      const { owner, business, product } = await createOwnerWithProduct("gate-recon3");
      await inventory.receiveStock(
        owner.id,
        business.id,
        product.id,
        { quantity: 30 },
        TEST_CORRELATION_ID,
      );

      const first = await inventory.reconcileStock(business.id, product.id);
      const second = await inventory.reconcileStock(business.id, product.id);

      expect(first.quantityOnHand).toBe(30);
      expect(second.quantityOnHand).toBe(30);
      expect(await prisma.productStock.count()).toBe(1);
      expect(await prisma.inventoryMovement.count()).toBe(1);
    });

    it("reconciling one product never touches another product's stock, even within the same business", async () => {
      const { owner, business, product: productA } = await createOwnerWithProduct("gate-recon4");
      const category = await categories.create(owner.id, business.id, { name: "Other" });
      const productB = await products.create(owner.id, business.id, {
        name: "Gadget",
        categoryId: category.id,
      });
      await inventory.receiveStock(
        owner.id,
        business.id,
        productA.id,
        { quantity: 10 },
        TEST_CORRELATION_ID,
      );
      await inventory.receiveStock(
        owner.id,
        business.id,
        productB.id,
        { quantity: 999 },
        TEST_CORRELATION_ID,
      );

      await inventory.reconcileStock(business.id, productA.id);

      const stockB = await inventory.getStock(owner.id, business.id, productB.id);
      expect(stockB.quantityOnHand).toBe(999);
    });
  });

  // -- Tenant isolation, systematically, across every write and read -------

  describe("tenant isolation across every inventory operation", () => {
    it("rejects every write command (receive/adjust/loss/createBatch) targeting a product from a different business", async () => {
      const { owner: ownerA, business: businessA } = await createOwnerWithProduct("gate-tenA1", {
        expirationTrackingEnabled: true,
      });
      const { product: productB } = await createOwnerWithProduct("gate-tenB1", {
        expirationTrackingEnabled: true,
      });

      await expect(
        inventory.receiveStock(
          ownerA.id,
          businessA.id,
          productB.id,
          { quantity: 1 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });

      await expect(
        inventory.adjustStock(
          ownerA.id,
          businessA.id,
          productB.id,
          { quantity: 1 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });

      await expect(
        inventory.recordLoss(
          ownerA.id,
          businessA.id,
          productB.id,
          { quantity: 1, lossReason: "other" },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });

      await expect(
        expirationBatches.createBatch(
          ownerA.id,
          businessA.id,
          productB.id,
          { quantity: 1, expiresAt: "2026-06-15" },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });

      // Nothing was written anywhere as a side effect of any rejected attempt.
      expect(await prisma.inventoryMovement.count()).toBe(0);
      expect(await prisma.productStock.count()).toBe(0);
      expect(await prisma.productExpirationBatch.count()).toBe(0);
    });

    it("rejects every read (getStock/reconcileStock) targeting a product from a different business", async () => {
      const { owner: ownerA, business: businessA } = await createOwnerWithProduct("gate-tenA2");
      const { product: productB } = await createOwnerWithProduct("gate-tenB2");

      await expect(inventory.getStock(ownerA.id, businessA.id, productB.id)).rejects.toMatchObject({
        code: "PRODUCT_NOT_FOUND",
      });
      await expect(inventory.reconcileStock(businessA.id, productB.id)).rejects.toMatchObject({
        code: "PRODUCT_NOT_FOUND",
      });
    });

    it("never lets one business's stock alerts or expiration alerts leak into another business's list", async () => {
      const {
        owner: ownerA,
        business: businessA,
        product: productA,
      } = await createOwnerWithProduct("gate-tenA3", { expirationTrackingEnabled: true });
      await inventory.adjustStock(
        ownerA.id,
        businessA.id,
        productA.id,
        { quantity: -1 },
        TEST_CORRELATION_ID,
      );
      await expirationBatches.createBatch(
        ownerA.id,
        businessA.id,
        productA.id,
        { quantity: 1, expiresAt: "2026-06-02" },
        TEST_CORRELATION_ID,
      );

      const {
        owner: ownerB,
        business: businessB,
        product: productB,
      } = await createOwnerWithProduct("gate-tenB3", { expirationTrackingEnabled: true });
      await inventory.adjustStock(
        ownerB.id,
        businessB.id,
        productB.id,
        { quantity: -1 },
        TEST_CORRELATION_ID,
      );
      await expirationBatches.createBatch(
        ownerB.id,
        businessB.id,
        productB.id,
        { quantity: 1, expiresAt: "2026-06-02" },
        TEST_CORRELATION_ID,
      );

      const stockAlertsA = await inventory.listStockAlerts(ownerA.id, businessA.id);
      expect(stockAlertsA.map((alert) => alert.productId)).toEqual([productA.id]);

      const expirationAlertsA = await expirationBatches.listAlerts(ownerA.id, businessA.id);
      expect(expirationAlertsA.map((alert) => alert.productId)).toEqual([productA.id]);
    });

    it("rejects resolving an expiration batch through a mismatched business or product", async () => {
      const {
        owner: ownerA,
        business: businessA,
        product: productA,
      } = await createOwnerWithProduct("gate-tenA4", { expirationTrackingEnabled: true });
      const batch = await expirationBatches.createBatch(
        ownerA.id,
        businessA.id,
        productA.id,
        { quantity: 1, expiresAt: "2026-06-15" },
        TEST_CORRELATION_ID,
      );
      const { business: businessB, product: productB } = await createOwnerWithProduct(
        "gate-tenB4",
        {
          expirationTrackingEnabled: true,
        },
      );

      await expect(
        expirationBatches.resolveBatch(
          ownerA.id,
          businessB.id,
          productA.id,
          batch.id,
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
      await expect(
        expirationBatches.resolveBatch(
          ownerA.id,
          businessA.id,
          productB.id,
          batch.id,
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "EXPIRATION_BATCH_NOT_FOUND" });
    });
  });

  // -- Expiration alerts never create a movement or change stock -----------

  describe("expiration alerts stay purely informational across their full lifecycle", () => {
    it("never writes an inventory movement or stock row through create -> not-yet-alerting -> near-expiration -> expired -> resolve -> list", async () => {
      const { owner, business, product } = await createOwnerWithProduct("gate-life1", {
        expirationTrackingEnabled: true,
      });
      async function assertLedgerUntouched() {
        expect(await prisma.inventoryMovement.count()).toBe(0);
        expect(await prisma.productStock.count()).toBe(0);
      }

      const batch = await expirationBatches.createBatch(
        owner.id,
        business.id,
        product.id,
        { quantity: 6, expiresAt: "2026-06-10" },
        TEST_CORRELATION_ID,
      );
      expect(await expirationBatches.listAlerts(owner.id, business.id)).toEqual([]);
      assertLedgerUntouched();

      // Time-travel into the near-expiration window (default 7 days).
      testContext.clock.set(new Date("2026-06-05T00:00:00.000Z"));
      const nearAlerts = await expirationBatches.listAlerts(owner.id, business.id);
      expect(nearAlerts).toEqual([
        {
          batchId: batch.id,
          productId: product.id,
          productName: product.name,
          quantity: 6,
          expiresAt: new Date("2026-06-10T00:00:00.000Z"),
          status: "near_expiration",
        },
      ]);
      assertLedgerUntouched();

      // Time-travel past expiration.
      testContext.clock.set(new Date("2026-06-11T00:00:00.000Z"));
      const expiredAlerts = await expirationBatches.listAlerts(owner.id, business.id);
      expect(expiredAlerts[0]?.status).toBe("expired");
      assertLedgerUntouched();

      // The human's decision (SPECS.md 8.4) -- here, resolving the alert
      // as handled -- still creates no movement or stock effect.
      await expirationBatches.resolveBatch(
        owner.id,
        business.id,
        product.id,
        batch.id,
        TEST_CORRELATION_ID,
      );
      expect(await expirationBatches.listAlerts(owner.id, business.id)).toEqual([]);
      assertLedgerUntouched();

      // A real stock effect for expired product only ever happens through
      // the existing, separate, explicit recordLoss command.
      const loss = await inventory.recordLoss(
        owner.id,
        business.id,
        product.id,
        { quantity: 6, lossReason: "expiration" },
        TEST_CORRELATION_ID,
      );
      expect(loss.stock.quantityOnHand).toBe(-6);
    });
  });
});
