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

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Expiration batches and alerts", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let categories: CategoriesService;
  let products: ProductsService;
  let configuration: ConfigurationService;
  let expirationBatches: ExpirationBatchesService;
  let testContext: TestContext;

  beforeAll(async () => {
    // A fixed, controllable clock (packages/domain/src/testing) --
    // near-expiration-window classification is exactly the time-sensitive
    // logic its own doc comment names as a motivating case; wall-clock
    // time would make the "near_expiration" vs "expired" boundary tests
    // flaky/undeterministic.
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
        ExpirationBatchesService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    categories = moduleRef.get(CategoriesService);
    products = moduleRef.get(ProductsService);
    configuration = moduleRef.get(ConfigurationService);
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

  /** Enables the business-level flag and, unless `trackProduct` is false, the product-level opt-in too. */
  async function createOwnerWithTrackedProduct(
    emailPrefix: string,
    options: { trackProduct?: boolean; nearExpirationWindowDays?: number } = {},
  ) {
    const owner = await users.create({
      email: `${emailPrefix}@kiosk.test`,
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Dairy" });
    const product = await products.create(owner.id, business.id, {
      name: "Milk",
      categoryId: category.id,
      expirationTrackingEnabled: options.trackProduct ?? true,
    });
    await configuration.updateSections(
      owner.id,
      business.id,
      {
        featureFlags: { ...FEATURE_FLAGS_DEFAULT, expirationTracking: true },
        ...(options.nearExpirationWindowDays === undefined
          ? {}
          : { expirationPolicy: { nearExpirationWindowDays: options.nearExpirationWindowDays } }),
      },
      TEST_CORRELATION_ID,
    );
    return { owner, business, product };
  }

  // -- createBatch -----------------------------------------------------------

  it("creates a batch and its audit record, without touching the inventory ledger/projection", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner1");

    const batch = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 24, expiresAt: "2026-06-15" },
      TEST_CORRELATION_ID,
    );

    expect(batch).toMatchObject({
      businessId: business.id,
      productId: product.id,
      quantity: 24,
      actorUserId: owner.id,
      correlationId: TEST_CORRELATION_ID,
      resolvedAt: null,
    });

    const auditEvents = await prisma.auditEvent.findMany({
      where: { targetType: "expiration_batch", targetId: batch.id },
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ action: "expiration_batch.created" });

    // Isolated from the non-expiration inventory path (ROADMAP.md).
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.productStock.count()).toBe(0);
  });

  it("rejects creating a batch when the business has not enabled featureFlags.expirationTracking", async () => {
    const owner = await users.create({
      email: "exp-owner2@kiosk.test",
      password: "correct-horse-1",
    });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    const category = await categories.create(owner.id, business.id, { name: "Dairy" });
    const product = await products.create(owner.id, business.id, {
      name: "Milk",
      categoryId: category.id,
      expirationTrackingEnabled: true,
    });
    // Feature flag left at its default (disabled) -- no updateSections call.

    await expect(
      expirationBatches.createBatch(
        owner.id,
        business.id,
        product.id,
        { quantity: 1, expiresAt: "2026-06-15" },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "EXPIRATION_TRACKING_DISABLED" });
  });

  it("rejects creating a batch for a product that has not opted in, even with the business flag enabled", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner3", {
      trackProduct: false,
    });

    await expect(
      expirationBatches.createBatch(
        owner.id,
        business.id,
        product.id,
        { quantity: 1, expiresAt: "2026-06-15" },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_EXPIRATION_TRACKING_DISABLED" });
  });

  it("rejects an Employee (needs inventory.adjust)", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner4");
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    const employee = await users.create({
      email: "exp-owner4-employee@kiosk.test",
      password: "correct-horse-1",
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      TEST_CORRELATION_ID,
    );

    await expect(
      expirationBatches.createBatch(
        employee.id,
        business.id,
        product.id,
        { quantity: 1, expiresAt: "2026-06-15" },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  // -- resolveBatch ------------------------------------------------------------

  it("resolves a batch, audits it, and rejects resolving it twice", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner5");
    const batch = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 10, expiresAt: "2026-06-15" },
      TEST_CORRELATION_ID,
    );

    const resolved = await expirationBatches.resolveBatch(
      owner.id,
      business.id,
      product.id,
      batch.id,
      TEST_CORRELATION_ID,
    );
    expect(resolved.resolvedAt).not.toBeNull();

    await expect(
      expirationBatches.resolveBatch(
        owner.id,
        business.id,
        product.id,
        batch.id,
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "EXPIRATION_BATCH_ALREADY_RESOLVED" });

    const auditEvents = await prisma.auditEvent.findMany({
      where: { targetType: "expiration_batch", targetId: batch.id },
    });
    expect(auditEvents.map((event) => event.action).sort()).toEqual([
      "expiration_batch.created",
      "expiration_batch.resolved",
    ]);
  });

  it("rejects resolving a batch that belongs to a different product/business", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner6a");
    const { product: otherProduct } = await createOwnerWithTrackedProduct("exp-owner6b");
    const batch = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 1, expiresAt: "2026-06-15" },
      TEST_CORRELATION_ID,
    );

    await expect(
      expirationBatches.resolveBatch(
        owner.id,
        business.id,
        otherProduct.id,
        batch.id,
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "EXPIRATION_BATCH_NOT_FOUND" });
  });

  // -- listAlerts --------------------------------------------------------------

  it("classifies batches as expired, near_expiration, or not yet alerting, using the configured window", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner7", {
      nearExpirationWindowDays: 5,
    });
    // Clock fixed at 2026-06-01.
    const expired = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 1, expiresAt: "2026-05-30" },
      TEST_CORRELATION_ID,
    );
    const nearExpiration = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 2, expiresAt: "2026-06-04" },
      TEST_CORRELATION_ID,
    );
    const notYet = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 3, expiresAt: "2026-06-20" },
      TEST_CORRELATION_ID,
    );

    const alerts = await expirationBatches.listAlerts(owner.id, business.id);

    expect(alerts.map((alert) => alert.batchId)).toEqual([expired.id, nearExpiration.id]);
    expect(alerts.find((alert) => alert.batchId === expired.id)?.status).toBe("expired");
    expect(alerts.find((alert) => alert.batchId === nearExpiration.id)?.status).toBe(
      "near_expiration",
    );
    expect(alerts.some((alert) => alert.batchId === notYet.id)).toBe(false);
  });

  it("excludes resolved batches from the alert list", async () => {
    const { owner, business, product } = await createOwnerWithTrackedProduct("exp-owner8");
    const batch = await expirationBatches.createBatch(
      owner.id,
      business.id,
      product.id,
      { quantity: 1, expiresAt: "2026-05-30" },
      TEST_CORRELATION_ID,
    );
    expect(await expirationBatches.listAlerts(owner.id, business.id)).toHaveLength(1);

    await expirationBatches.resolveBatch(
      owner.id,
      business.id,
      product.id,
      batch.id,
      TEST_CORRELATION_ID,
    );

    expect(await expirationBatches.listAlerts(owner.id, business.id)).toEqual([]);
  });

  it("scopes alerts to one business only", async () => {
    const {
      owner: ownerA,
      business: businessA,
      product: productA,
    } = await createOwnerWithTrackedProduct("exp-owner9a");
    await expirationBatches.createBatch(
      ownerA.id,
      businessA.id,
      productA.id,
      { quantity: 1, expiresAt: "2026-05-30" },
      TEST_CORRELATION_ID,
    );
    const {
      owner: ownerB,
      business: businessB,
      product: productB,
    } = await createOwnerWithTrackedProduct("exp-owner9b");
    await expirationBatches.createBatch(
      ownerB.id,
      businessB.id,
      productB.id,
      { quantity: 1, expiresAt: "2026-05-30" },
      TEST_CORRELATION_ID,
    );

    const alerts = await expirationBatches.listAlerts(ownerA.id, businessA.id);

    expect(alerts.map((alert) => alert.productId)).toEqual([productA.id]);
  });

  it("rejects a caller with no membership in the business", async () => {
    const { business } = await createOwnerWithTrackedProduct("exp-owner10");
    const stranger = await users.create({
      email: "exp-owner10-stranger@kiosk.test",
      password: "correct-horse-1",
    });

    await expect(expirationBatches.listAlerts(stranger.id, business.id)).rejects.toMatchObject({
      code: "MEMBERSHIP_NOT_FOUND",
    });
  });
});
