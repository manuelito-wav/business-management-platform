import "reflect-metadata";
import { Uuidv7Generator } from "@bmp/domain";
import { createTestContext, type TestContext } from "@bmp/domain/testing";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { CashService } from "../cash/cash.service";
import { CategoriesService } from "../catalog/categories.service";
import { ProductsService } from "../catalog/products.service";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { InventoryService } from "../inventory/inventory.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { OutboxService } from "../outbox/outbox.service";
import { PricingService } from "../pricing/pricing.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterSessionsService } from "../registers/register-sessions.service";
import { RegistersService } from "../registers/registers.service";
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
  let registers: RegistersService;
  let registerSessions: RegisterSessionsService;
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
        RegistersService,
        RegisterSessionsService,
        InventoryService,
        CashService,
        OutboxService,
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
    registers = moduleRef.get(RegistersService);
    registerSessions = moduleRef.get(RegisterSessionsService);
    sales = moduleRef.get(SalesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    testContext.clock.set(new Date("2026-06-01T00:00:00.000Z"));
    // outboxEvent has no restricting FK, but cashMovement/sale both
    // restrict-reference registerSession -- clear them first (the same
    // lesson as the earlier sale/product cleanup-ordering fix).
    await prisma.outboxEvent.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productStock.deleteMany();
    await prisma.cashMovement.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.registerSession.deleteMany();
    await prisma.register.deleteMany();
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
    const register = await registers.create(
      owner.id,
      business.id,
      { name: "Register 1" },
      TEST_CORRELATION_ID,
    );
    const session = await registerSessions.open(
      owner.id,
      business.id,
      register.id,
      {},
      TEST_CORRELATION_ID,
    );
    return { owner, business, product, session };
  }

  it("start creates an in_progress sale with one line, the right total, and firstItemAt set to now", async () => {
    const { owner, business, product, session } = await createOwnerWithPricedProduct("sale-owner1");

    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 3 },
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
    const register = await registers.create(
      owner.id,
      business.id,
      { name: "Register 1" },
      TEST_CORRELATION_ID,
    );
    const session = await registerSessions.open(
      owner.id,
      business.id,
      register.id,
      {},
      TEST_CORRELATION_ID,
    );

    await expect(
      sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "SALE_PRODUCT_HAS_NO_PRICING" });
  });

  it("computes a weighted line's total as price-per-kg * grams / 1000", async () => {
    const { owner, business, product, session } = await createOwnerWithPricedProduct(
      "sale-owner3",
      {
        saleMode: "weighted",
        weightUnit: "kg",
      },
    );
    // salePrice 10000 = $100.00/kg; 750g -> $75.00 (7500).

    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 750 },
      TEST_CORRELATION_ID,
    );

    expect(sale.total).toBe(7500);
    expect(sale.lines[0]?.lineTotal).toBe(7500);
  });

  it("addLine merges a repeated unit-mode product into the existing line, keeping its original price snapshot", async () => {
    const { owner, business, product, session } = await createOwnerWithPricedProduct("sale-owner4");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
    const { owner, business, product, session } = await createOwnerWithPricedProduct(
      "sale-owner5",
      {
        saleMode: "weighted",
        weightUnit: "kg",
      },
    );
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 500 },
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
    const { owner, business, product, session } = await createOwnerWithPricedProduct("sale-owner6");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
    const { owner, business, product, session } = await createOwnerWithPricedProduct("sale-owner7");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
    const { owner, business, product, session } = await createOwnerWithPricedProduct("sale-owner8");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
    const { owner, business, product, session } = await createOwnerWithPricedProduct("sale-owner9");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
    const { owner, business, product, session } =
      await createOwnerWithPricedProduct("sale-owner10");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
      TEST_CORRELATION_ID,
    );
    await sales.addPayment(
      owner.id,
      business.id,
      sale.id,
      { method: "cash", amount: 10000 },
      TEST_CORRELATION_ID,
    );

    const completed = await prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id));

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(completed.changeDue).toBe(0);
  });

  it("rejects completing a sale with no lines", async () => {
    const { owner, business, product, session } =
      await createOwnerWithPricedProduct("sale-owner11");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
    const { owner, business, product, session } =
      await createOwnerWithPricedProduct("sale-owner12");
    const sale = await sales.start(
      owner.id,
      business.id,
      { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
      const { owner, business, product, session } =
        await createOwnerWithPricedProduct("sale-owner13");
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );

      await expect(sales.abandon(business.id, sale.id, TEST_CORRELATION_ID)).rejects.toMatchObject({
        code: "SALE_NOT_ABANDONABLE",
      });
    });

    it("abandons a sale once it has sat in_progress past the business's configured threshold", async () => {
      const { owner, business, product, session } =
        await createOwnerWithPricedProduct("sale-owner14");
      await configuration.updateSections(
        owner.id,
        business.id,
        { salePolicy: { abandonmentThresholdMinutes: 30 } },
        TEST_CORRELATION_ID,
      );
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
      const { owner, business, product, session } =
        await createOwnerWithPricedProduct("sale-owner15");
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );
      await prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id));
      testContext.clock.advanceMs(300 * 60_000);

      await expect(sales.abandon(business.id, sale.id, TEST_CORRELATION_ID)).rejects.toMatchObject({
        code: "SALE_NOT_ABANDONABLE",
      });
    });
  });

  describe("split payment settlement (SPECS.md 6.6/10.2)", () => {
    async function startTenThousandSale(emailPrefix: string) {
      const { owner, business, product, session } = await createOwnerWithPricedProduct(emailPrefix);
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );
      return { owner, business, sale };
    }

    it("cash and card self-verify immediately; matches ROADMAP's own split example", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay1");

      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 4000 },
        TEST_CORRELATION_ID,
      );
      const updated = await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "card", amount: 6000 },
        TEST_CORRELATION_ID,
      );

      expect(updated.payments).toHaveLength(2);
      expect(updated.payments.every((payment) => payment.verifiedAt !== null)).toBe(true);
      expect(updated.paymentStatus).toEqual({
        satisfied: true,
        changeDue: 0,
        totalTendered: 10000,
      });
    });

    it("qr and transfer start unverified and require an explicit verifyPayment call", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay2");

      const afterAdd = await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "qr", amount: 10000 },
        TEST_CORRELATION_ID,
      );
      expect(afterAdd.payments[0]?.verifiedAt).toBeNull();
      expect(afterAdd.paymentStatus.satisfied).toBe(false);

      const verified = await sales.verifyPayment(
        owner.id,
        business.id,
        sale.id,
        afterAdd.payments[0]!.id,
        TEST_CORRELATION_ID,
      );
      expect(verified.payments[0]?.verifiedAt).toEqual(new Date("2026-06-01T00:00:00.000Z"));
      expect(verified.paymentStatus.satisfied).toBe(true);
    });

    it("computes change due when cash tendered exceeds what remains", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay3");

      const updated = await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 15000 },
        TEST_CORRELATION_ID,
      );

      expect(updated.paymentStatus).toEqual({
        satisfied: true,
        changeDue: 5000,
        totalTendered: 15000,
      });
    });

    it("rejects a non-cash payment that alone would exceed the sale's total", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay4");

      await expect(
        sales.addPayment(
          owner.id,
          business.id,
          sale.id,
          { method: "card", amount: 10500 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "SALE_PAYMENT_EXCEEDS_TOTAL" });
    });

    it("rejects a payment method the business has not enabled", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay5");
      await configuration.updateSections(
        owner.id,
        business.id,
        { paymentMethods: { enabled: ["cash"] } },
        TEST_CORRELATION_ID,
      );

      await expect(
        sales.addPayment(
          owner.id,
          business.id,
          sale.id,
          { method: "card", amount: 10000 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "SALE_PAYMENT_METHOD_DISABLED" });
    });

    it("removePayment removes one allocation and recomputes paymentStatus", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay6");
      const withPayment = await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      const removed = await sales.removePayment(
        owner.id,
        business.id,
        sale.id,
        withPayment.payments[0]!.id,
        TEST_CORRELATION_ID,
      );

      expect(removed.payments).toHaveLength(0);
      expect(removed.paymentStatus.satisfied).toBe(false);
    });

    it("rejects verifying a self-verifying method (cash/card)", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay7");
      const withPayment = await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      await expect(
        sales.verifyPayment(
          owner.id,
          business.id,
          sale.id,
          withPayment.payments[0]!.id,
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "SALE_PAYMENT_VERIFICATION_NOT_APPLICABLE" });
    });

    it("rejects verifying an already-verified payment a second time", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay8");
      const withPayment = await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "transfer", amount: 10000 },
        TEST_CORRELATION_ID,
      );
      const paymentId = withPayment.payments[0]!.id;
      await sales.verifyPayment(owner.id, business.id, sale.id, paymentId, TEST_CORRELATION_ID);

      await expect(
        sales.verifyPayment(owner.id, business.id, sale.id, paymentId, TEST_CORRELATION_ID),
      ).rejects.toMatchObject({ code: "SALE_PAYMENT_ALREADY_VERIFIED" });
    });

    it("rejects mutating payments once the sale is no longer in_progress", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay9");
      await sales.cancel(owner.id, business.id, sale.id, TEST_CORRELATION_ID);

      await expect(
        sales.addPayment(
          owner.id,
          business.id,
          sale.id,
          { method: "cash", amount: 10000 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "SALE_NOT_IN_PROGRESS" });
    });

    it("complete rejects an unsatisfied allocation and succeeds once it is satisfied, recording changeDue", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay10");

      await expect(
        prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id)),
      ).rejects.toMatchObject({ code: "SALE_PAYMENT_NOT_SATISFIED" });

      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10300 },
        TEST_CORRELATION_ID,
      );
      const completed = await prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id));

      expect(completed.status).toBe("completed");
      expect(completed.changeDue).toBe(300);
    });

    it("complete rejects while a qr/transfer payment is still unverified even if the amounts add up", async () => {
      const { owner, business, sale } = await startTenThousandSale("sale-pay11");
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "qr", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      await expect(
        prisma.$transaction((tx) => sales.complete(tx, business.id, sale.id)),
      ).rejects.toMatchObject({ code: "SALE_PAYMENT_NOT_SATISFIED" });
    });
  });

  describe("settle sales with stock and cash effects (ARCHITECTURE.md 'Financial settlement')", () => {
    async function startTenThousandSale2(emailPrefix: string, quantity = 1) {
      const { owner, business, product, session } = await createOwnerWithPricedProduct(emailPrefix);
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity },
        TEST_CORRELATION_ID,
      );
      return { owner, business, product, session, sale };
    }

    it("writes a sale inventory movement per line and a net sale_settlement cash movement for cash-only payment", async () => {
      const { owner, business, product, session, sale } = await startTenThousandSale2(
        "sale-settle1",
        2,
      );
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 20000 },
        TEST_CORRELATION_ID,
      );

      const settled = await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-1" },
        TEST_CORRELATION_ID,
      );

      expect(settled.status).toBe("completed");
      expect(settled.changeDue).toBe(0);

      const movements = await prisma.inventoryMovement.findMany({
        where: { businessId: business.id, productId: product.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        reason: "sale",
        quantity: -2,
        sourceOperationId: sale.id,
      });

      const stock = await prisma.productStock.findUnique({
        where: { productId_businessId: { productId: product.id, businessId: business.id } },
      });
      expect(stock?.quantityOnHand).toBe(-2);

      const cashMovements = await prisma.cashMovement.findMany({
        where: { businessId: business.id, registerSessionId: session.id },
      });
      expect(cashMovements).toHaveLength(1);
      expect(cashMovements[0]).toMatchObject({ type: "sale_settlement", amount: 20000 });
    });

    it("records the net cash portion only, not the full amount tendered, when cash produces change", async () => {
      const { owner, business, session, sale } = await startTenThousandSale2("sale-settle2");
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10500 },
        TEST_CORRELATION_ID,
      );

      const settled = await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-2" },
        TEST_CORRELATION_ID,
      );
      expect(settled.changeDue).toBe(500);

      const cashMovements = await prisma.cashMovement.findMany({
        where: { businessId: business.id, registerSessionId: session.id },
      });
      // The drawer only ever nets $100.00 (10000), never the $105.00
      // tendered -- the other $5.00 goes right back out as change.
      expect(cashMovements).toHaveLength(1);
      expect(cashMovements[0]?.amount).toBe(10000);
    });

    it("skips the cash movement entirely when the sale was paid fully by a non-cash method", async () => {
      const { owner, business, session, sale } = await startTenThousandSale2("sale-settle3");
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "card", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-3" },
        TEST_CORRELATION_ID,
      );

      const cashMovements = await prisma.cashMovement.findMany({
        where: { businessId: business.id, registerSessionId: session.id },
      });
      expect(cashMovements).toHaveLength(0);
    });

    it("writes a sale.completed outbox event and audit record", async () => {
      const { owner, business, sale } = await startTenThousandSale2("sale-settle4");
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-4" },
        TEST_CORRELATION_ID,
      );

      const events = await prisma.outboxEvent.findMany({
        where: { businessId: business.id, targetId: sale.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ eventType: "sale.completed", status: "pending" });

      const auditEvents = await prisma.auditEvent.findMany({
        where: { businessId: business.id, targetId: sale.id, action: "sale.completed" },
      });
      expect(auditEvents).toHaveLength(1);
    });

    it("is idempotent under an operation-ID retry: returns the same result without duplicating effects", async () => {
      const { owner, business, product, session, sale } =
        await startTenThousandSale2("sale-settle5");
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      const first = await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-5" },
        TEST_CORRELATION_ID,
      );
      const retried = await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-5" },
        TEST_CORRELATION_ID,
      );

      expect(retried).toEqual(first);

      const movements = await prisma.inventoryMovement.findMany({
        where: { businessId: business.id, productId: product.id },
      });
      expect(movements).toHaveLength(1);
      const cashMovements = await prisma.cashMovement.findMany({
        where: { businessId: business.id, registerSessionId: session.id },
      });
      expect(cashMovements).toHaveLength(1);
    });

    it("rejects reusing an operationId that already settled a different sale", async () => {
      const { owner, business, product, session, sale } =
        await startTenThousandSale2("sale-settle6");
      await sales.addPayment(
        owner.id,
        business.id,
        sale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );
      await sales.settle(
        owner.id,
        business.id,
        sale.id,
        { operationId: "op-settle-6" },
        TEST_CORRELATION_ID,
      );

      // A second, independent sale in the SAME business/session.
      const secondSale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
        TEST_CORRELATION_ID,
      );
      await sales.addPayment(
        owner.id,
        business.id,
        secondSale.id,
        { method: "cash", amount: 10000 },
        TEST_CORRELATION_ID,
      );

      await expect(
        sales.settle(
          owner.id,
          business.id,
          secondSale.id,
          { operationId: "op-settle-6" },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "SALE_OPERATION_ID_REUSED" });
    });
  });

  describe("tenancy and authorization", () => {
    it("rejects starting a sale for a product that belongs to a different business", async () => {
      const { product: productA } = await createOwnerWithPricedProduct("sale-tenant-a");
      const {
        owner: ownerB,
        business: businessB,
        session: sessionB,
      } = await createOwnerWithPricedProduct("sale-tenant-b");

      await expect(
        sales.start(
          ownerB.id,
          businessB.id,
          { registerSessionId: sessionB.id, productId: productA.id, quantity: 1 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    });

    it("rejects reading a sale scoped to a different business", async () => {
      const { owner, business, product, session } =
        await createOwnerWithPricedProduct("sale-tenant-c");
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
          { registerSessionId: "whatever-session", productId: "whatever", quantity: 1 },
          TEST_CORRELATION_ID,
        ),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects cancelling a sale from a member without sales.cancel", async () => {
      const { owner, business, product, session } =
        await createOwnerWithPricedProduct("sale-perm-owner2");
      const sale = await sales.start(
        owner.id,
        business.id,
        { registerSessionId: session.id, productId: product.id, quantity: 1 },
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
