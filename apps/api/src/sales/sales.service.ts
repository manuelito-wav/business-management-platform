import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  GRAMS_PER_KILOGRAM,
  resolvePaymentAllocation,
  roundedIntegerMultiplyDivide,
  type Clock,
  type IdGenerator,
} from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { ProductsService } from "../catalog/products.service";
import { ConfigurationService } from "../configuration/configuration.service";
import { Prisma, ProductSaleMode, Sale, SaleStatus } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { AddPaymentDto } from "./dto/add-payment.dto";
import { SaleLineInputDto } from "./dto/sale-line-input.dto";

type SaleClient = PrismaService | Prisma.TransactionClient;

/**
 * A sale still `in_progress` whose first line was added more than
 * `thresholdMinutes` ago (SPECS.md 14.4 / ROADMAP.md "Define abandonment
 * rules so inactive tabs do not skew ticket-duration reporting"). Pure
 * and deterministic on purpose -- unit-testable without a database, and
 * reused identically by SalesService.abandon and (eventually) whatever
 * later Phase 5 checkpoint builds ticket-duration reporting.
 */
export function isSaleAbandoned(
  sale: { status: SaleStatus; firstItemAt: Date },
  now: Date,
  thresholdMinutes: number,
): boolean {
  if (sale.status !== "in_progress") {
    return false;
  }
  const elapsedMs = now.getTime() - sale.firstItemAt.getTime();
  return elapsedMs >= thresholdMinutes * 60_000;
}

function computeLineTotal(
  saleMode: ProductSaleMode,
  unitSalePrice: number,
  quantity: number,
): number {
  if (saleMode === "weighted") {
    // unitSalePrice is price-per-kilogram, quantity is integer grams --
    // the same documented convention as the POS cart's own
    // CartLine.unitPrice (apps/web/lib/pos/cart.ts) and the same
    // rounding primitive apps/web/lib/pos/totals.ts uses for the
    // identical computation client-side.
    return roundedIntegerMultiplyDivide(unitSalePrice, quantity, GRAMS_PER_KILOGRAM);
  }
  return unitSalePrice * quantity;
}

/** Cash and card have no separate manual-verification step yet (SPECS.md 10.3 names only qr/transfer) -- self-verified the instant they are added. */
function isSelfVerifyingMethod(method: AddPaymentDto["method"]): boolean {
  return method === "cash" || method === "card";
}

/**
 * The immutable sale aggregate and its explicit state transitions
 * (ROADMAP.md "add sale aggregate and state transitions" / "add split
 * payment settlement") -- see schema.prisma's Sale/SaleLine/Payment doc
 * comments for the full status/field reasoning. Not yet wired to the
 * live POS UI: lib/pos/cart.ts's tabs stay entirely client-side through
 * this checkpoint (D-010, and the "add multi-tab POS drafts" checkpoint's
 * own explicit design). `start`/`addLine`/`updateLineQuantity`/
 * `removeLine`/`cancel`/`addPayment`/`removePayment`/`verifyPayment` are
 * complete, self-contained operations (each opens its own transaction)
 * usable as soon as a caller exists; `complete` is deliberately narrower
 * -- composable into an existing transaction client, since ROADMAP.md's
 * later "settle sales with stock and cash effects" checkpoint needs to
 * call it as one step inside its own single atomic "complete sale"
 * transaction (the inventory/cash effects themselves belong to that
 * checkpoint, not here -- payment *validation* is this checkpoint's own
 * job and already runs inside `complete` below).
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly products: ProductsService,
    private readonly configuration: ConfigurationService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async start(
    actingUserId: string,
    businessId: string,
    dto: SaleLineInputDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    const product = await this.requirePricedProduct(actingUserId, businessId, dto.productId);
    const lineTotal = computeLineTotal(product.saleMode, product.pricing.salePrice, dto.quantity);
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          id: this.ids.generate(),
          businessId,
          actorUserId: actingUserId,
          status: "in_progress",
          total: lineTotal,
          firstItemAt: now,
        },
      });
      await tx.saleLine.create({
        data: {
          id: this.ids.generate(),
          saleId: sale.id,
          businessId,
          productId: product.id,
          name: product.name,
          saleMode: product.saleMode,
          weightUnit: product.weightUnit,
          quantity: dto.quantity,
          unitCostPrice: product.pricing.costPrice,
          unitSalePrice: product.pricing.salePrice,
          lineTotal,
        },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.started",
        targetType: "sale",
        targetId: sale.id,
        after: { productId: product.id, quantity: dto.quantity, total: lineTotal },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, sale.id);
    });
  }

  async addLine(
    actingUserId: string,
    businessId: string,
    saleId: string,
    dto: SaleLineInputDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    await this.requireInProgress(businessId, saleId);
    const product = await this.requirePricedProduct(actingUserId, businessId, dto.productId);

    return this.prisma.$transaction(async (tx) => {
      // Unit-mode products merge into an already-present line for the same
      // product, same rule as the POS cart (lib/pos/cart.ts addProduct) --
      // a second weighted-product scan always gets its own line, since
      // each has its own weighed amount. A merge keeps the EXISTING
      // line's own price snapshot (not a fresh read of current pricing):
      // the two scans represent one combined purchase decision, and the
      // snapshot must not silently drift mid-sale if pricing changes
      // between them -- the same reasoning the cart already follows.
      const existing =
        product.saleMode === "unit"
          ? await tx.saleLine.findFirst({ where: { saleId, businessId, productId: product.id } })
          : null;

      if (existing) {
        const quantity = existing.quantity + dto.quantity;
        const lineTotal = computeLineTotal(existing.saleMode, existing.unitSalePrice, quantity);
        await tx.saleLine.update({ where: { id: existing.id }, data: { quantity, lineTotal } });
      } else {
        const lineTotal = computeLineTotal(
          product.saleMode,
          product.pricing.salePrice,
          dto.quantity,
        );
        await tx.saleLine.create({
          data: {
            id: this.ids.generate(),
            saleId,
            businessId,
            productId: product.id,
            name: product.name,
            saleMode: product.saleMode,
            weightUnit: product.weightUnit,
            quantity: dto.quantity,
            unitCostPrice: product.pricing.costPrice,
            unitSalePrice: product.pricing.salePrice,
            lineTotal,
          },
        });
      }

      const total = await this.recomputeTotal(tx, saleId);
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.line_added",
        targetType: "sale",
        targetId: saleId,
        after: { productId: product.id, quantity: dto.quantity, total },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  async updateLineQuantity(
    actingUserId: string,
    businessId: string,
    saleId: string,
    lineId: string,
    quantity: number,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    await this.requireInProgress(businessId, saleId);
    const line = await this.requireLine(businessId, saleId, lineId);

    return this.prisma.$transaction(async (tx) => {
      const lineTotal = computeLineTotal(line.saleMode, line.unitSalePrice, quantity);
      await tx.saleLine.update({ where: { id: lineId }, data: { quantity, lineTotal } });

      const total = await this.recomputeTotal(tx, saleId);
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.line_quantity_updated",
        targetType: "sale",
        targetId: saleId,
        before: { lineId, quantity: line.quantity },
        after: { lineId, quantity, total },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  async removeLine(
    actingUserId: string,
    businessId: string,
    saleId: string,
    lineId: string,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    await this.requireInProgress(businessId, saleId);
    await this.requireLine(businessId, saleId, lineId);

    return this.prisma.$transaction(async (tx) => {
      await tx.saleLine.delete({ where: { id: lineId } });

      const total = await this.recomputeTotal(tx, saleId);
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.line_removed",
        targetType: "sale",
        targetId: saleId,
        after: { lineId, total },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  /**
   * SPECS.md 6.6/10.2's split payments: adds one method's allocation.
   * Cash may exceed what remains (change is resolved at `complete` time);
   * every other method is rejected outright if it alone would push the
   * combined non-cash total past the sale's own total -- see
   * @bmp/domain's resolvePaymentAllocation for the full rule this
   * mirrors. Only enabled methods (paymentMethods.enabled, SPECS.md 10.1)
   * may be used.
   */
  async addPayment(
    actingUserId: string,
    businessId: string,
    saleId: string,
    dto: AddPaymentDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    await this.requireInProgress(businessId, saleId);
    const { paymentMethods } = await this.configuration.getSections(businessId);
    if (!paymentMethods.enabled.includes(dto.method)) {
      throw new AppException(
        "SALE_PAYMENT_METHOD_DISABLED",
        "This payment method is not enabled for this business.",
        HttpStatus.CONFLICT,
      );
    }
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
      if (dto.method !== "cash") {
        const existing = await tx.payment.findMany({ where: { saleId, method: { not: "cash" } } });
        const nonCashTotal =
          existing.reduce((sum, payment) => sum + payment.amount, 0) + dto.amount;
        if (nonCashTotal > sale.total) {
          throw new AppException(
            "SALE_PAYMENT_EXCEEDS_TOTAL",
            "This payment would exceed the sale's total; only cash may exceed it (as change).",
            HttpStatus.CONFLICT,
          );
        }
      }
      await tx.payment.create({
        data: {
          id: this.ids.generate(),
          saleId,
          businessId,
          method: dto.method,
          amount: dto.amount,
          verifiedAt: isSelfVerifyingMethod(dto.method) ? now : null,
        },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.payment_added",
        targetType: "sale",
        targetId: saleId,
        after: { method: dto.method, amount: dto.amount },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  async removePayment(
    actingUserId: string,
    businessId: string,
    saleId: string,
    paymentId: string,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    await this.requireInProgress(businessId, saleId);
    await this.requirePayment(businessId, saleId, paymentId);

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.payment_removed",
        targetType: "sale",
        targetId: saleId,
        after: { paymentId },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  /** SPECS.md 10.3: an employee manually confirms a qr/transfer payment actually arrived. */
  async verifyPayment(
    actingUserId: string,
    businessId: string,
    saleId: string,
    paymentId: string,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.create");
    await this.requireInProgress(businessId, saleId);
    const payment = await this.requirePayment(businessId, saleId, paymentId);
    if (isSelfVerifyingMethod(payment.method)) {
      throw new AppException(
        "SALE_PAYMENT_VERIFICATION_NOT_APPLICABLE",
        "This payment method does not require manual verification.",
        HttpStatus.CONFLICT,
      );
    }
    if (payment.verifiedAt) {
      throw new AppException(
        "SALE_PAYMENT_ALREADY_VERIFIED",
        "This payment was already verified.",
        HttpStatus.CONFLICT,
      );
    }
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { verifiedAt: now } });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.payment_verified",
        targetType: "sale",
        targetId: saleId,
        after: { paymentId },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  /** Explicit cashier cancellation of a sale before it ever completes -- SPECS.md 12.2's cancellation of an already-*completed* sale (with its reversal effects) is ROADMAP.md's later "add audited cancellations and refunds" checkpoint, not this one. */
  async cancel(actingUserId: string, businessId: string, saleId: string, correlationId: string) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.cancel");
    await this.requireInProgress(businessId, saleId);
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: { status: "cancelled", cancelledAt: now },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.cancelled",
        targetType: "sale",
        targetId: saleId,
        before: { status: "in_progress" },
        after: { status: "cancelled" },
        correlationId,
      });
      return this.loadSaleDetail(tx, businessId, saleId);
    });
  }

  /**
   * The `in_progress` -> `completed` transition -- validates the
   * aggregate's own invariants (must still be in progress, must have at
   * least one line, and its payment allocation must satisfy the total --
   * SPECS.md 6.6: "The sale can only complete when the required amount is
   * satisfied") and records the resulting `changeDue`. Takes the
   * caller's transaction client rather than opening its own: ROADMAP.md's
   * later "settle sales with stock and cash effects" checkpoint is what
   * actually calls this, as one step inside its own single atomic
   * "complete sale" command (the inventory/cash effects and their own
   * audit record are that checkpoint's responsibility, not this method's).
   */
  async complete(tx: Prisma.TransactionClient, businessId: string, saleId: string): Promise<Sale> {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale || sale.businessId !== businessId) {
      throw new AppException(
        "SALE_NOT_FOUND",
        "Sale not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    if (sale.status !== "in_progress") {
      throw new AppException(
        "SALE_NOT_IN_PROGRESS",
        "This sale is not in progress and cannot be completed.",
        HttpStatus.CONFLICT,
      );
    }
    const lineCount = await tx.saleLine.count({ where: { saleId } });
    if (lineCount === 0) {
      throw new AppException(
        "SALE_HAS_NO_LINES",
        "A sale with no lines cannot be completed.",
        HttpStatus.CONFLICT,
      );
    }
    const payments = await tx.payment.findMany({ where: { saleId } });
    const allocation = resolvePaymentAllocation(
      sale.total,
      payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        verifiedAt: payment.verifiedAt,
      })),
    );
    if (!allocation.satisfied) {
      throw new AppException(
        "SALE_PAYMENT_NOT_SATISFIED",
        "This sale's payment allocation does not yet satisfy its total.",
        HttpStatus.CONFLICT,
      );
    }
    return tx.sale.update({
      where: { id: saleId },
      data: { status: "completed", completedAt: this.clock.now(), changeDue: allocation.changeDue },
    });
  }

  /**
   * Transitions one specific sale from `in_progress` to `abandoned`, once
   * it actually qualifies under the business's own configured
   * salePolicy.abandonmentThresholdMinutes (isSaleAbandoned). There is no
   * scheduler in this checkpoint that calls this on a timer -- it is the
   * transition itself, ready for whatever later job/lazy-check triggers
   * it. Audited under the sale's own actorUserId (a system/scheduler
   * actor identity does not exist yet in this schema, and re-attributing
   * this to the employee whose sale it was is the closest honest fit).
   */
  async abandon(businessId: string, saleId: string, correlationId: string): Promise<Sale> {
    const sale = await this.requireSale(businessId, saleId, this.prisma);
    const { salePolicy } = await this.configuration.getSections(businessId);
    const now = this.clock.now();

    if (!isSaleAbandoned(sale, now, salePolicy.abandonmentThresholdMinutes)) {
      throw new AppException(
        "SALE_NOT_ABANDONABLE",
        "This sale does not yet qualify as abandoned.",
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id: saleId },
        data: { status: "abandoned", abandonedAt: now },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: sale.actorUserId,
        action: "sale.abandoned",
        targetType: "sale",
        targetId: saleId,
        before: { status: "in_progress" },
        after: { status: "abandoned" },
        correlationId,
      });
      return updated;
    });
  }

  async findOne(actingUserId: string, businessId: string, saleId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.loadSaleDetail(this.prisma, businessId, saleId);
  }

  private async requirePricedProduct(actingUserId: string, businessId: string, productId: string) {
    const product = await this.products.findOne(actingUserId, businessId, productId);
    if (!product.pricing) {
      throw new AppException(
        "SALE_PRODUCT_HAS_NO_PRICING",
        "This product has no pricing set and cannot be sold yet.",
        HttpStatus.CONFLICT,
      );
    }
    return { ...product, pricing: product.pricing };
  }

  private async requireSale(businessId: string, saleId: string, client: SaleClient) {
    const sale = await client.sale.findUnique({ where: { id: saleId } });
    if (!sale || sale.businessId !== businessId) {
      throw new AppException(
        "SALE_NOT_FOUND",
        "Sale not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return sale;
  }

  private async requireInProgress(businessId: string, saleId: string) {
    const sale = await this.requireSale(businessId, saleId, this.prisma);
    if (sale.status !== "in_progress") {
      throw new AppException(
        "SALE_NOT_IN_PROGRESS",
        "This sale is not in progress.",
        HttpStatus.CONFLICT,
      );
    }
    return sale;
  }

  private async requireLine(businessId: string, saleId: string, lineId: string) {
    const line = await this.prisma.saleLine.findUnique({ where: { id: lineId } });
    if (!line || line.businessId !== businessId || line.saleId !== saleId) {
      throw new AppException(
        "SALE_LINE_NOT_FOUND",
        "Sale line not found in this sale.",
        HttpStatus.NOT_FOUND,
      );
    }
    return line;
  }

  private async requirePayment(businessId: string, saleId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.businessId !== businessId || payment.saleId !== saleId) {
      throw new AppException(
        "SALE_PAYMENT_NOT_FOUND",
        "Payment not found on this sale.",
        HttpStatus.NOT_FOUND,
      );
    }
    return payment;
  }

  private async recomputeTotal(tx: Prisma.TransactionClient, saleId: string): Promise<number> {
    const lines = await tx.saleLine.findMany({ where: { saleId } });
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    await tx.sale.update({ where: { id: saleId }, data: { total } });
    return total;
  }

  /** The full public shape: the sale, its lines, its payments, and the payment allocation resolved against the sale's current total (@bmp/domain's resolvePaymentAllocation) -- so a caller never has to re-derive "is this satisfied / how much change" itself. */
  private async loadSaleDetail(client: SaleClient, businessId: string, saleId: string) {
    const sale = await client.sale.findUnique({
      where: { id: saleId },
      // Insertion order -- a receipt should show lines/payments in the
      // order they were actually scanned/allocated, not an otherwise
      // unspecified row order. Ordered by `id`, not `createdAt`: IDs are
      // UUIDv7 (D-033) and so already sort chronologically by
      // construction (the same reasoning AuditService.list's own doc
      // comment gives), which also sidesteps `createdAt`'s coarser,
      // per-transaction-frozen `CURRENT_TIMESTAMP` value -- two lines
      // inserted within the same transaction would otherwise share one
      // identical timestamp and sort arbitrarily against each other.
      include: {
        lines: { orderBy: { id: "asc" } },
        payments: { orderBy: { id: "asc" } },
      },
    });
    if (!sale || sale.businessId !== businessId) {
      throw new AppException(
        "SALE_NOT_FOUND",
        "Sale not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    const paymentStatus = resolvePaymentAllocation(
      sale.total,
      sale.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        verifiedAt: payment.verifiedAt,
      })),
    );
    return { ...sale, paymentStatus };
  }
}
