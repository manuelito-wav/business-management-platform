import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  GRAMS_PER_KILOGRAM,
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
import { SaleLineInputDto } from "./dto/sale-line-input.dto";

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

/**
 * The immutable sale aggregate and its explicit state transitions
 * (ROADMAP.md "add sale aggregate and state transitions") -- see
 * schema.prisma's Sale/SaleLine doc comments for the full status/field
 * reasoning. Not yet wired to the live POS UI: lib/pos/cart.ts's tabs
 * stay entirely client-side through this checkpoint (D-010, and the
 * "add multi-tab POS drafts" checkpoint's own explicit design). `start`/
 * `addLine`/`updateLineQuantity`/`removeLine`/`cancel` are complete,
 * self-contained operations (each opens its own transaction) usable as
 * soon as a caller exists; `complete` is deliberately narrower --
 * composable into an existing transaction client, since ROADMAP.md's
 * later "settle sales with stock and cash effects" checkpoint needs to
 * call it as one step inside its own single atomic "complete sale"
 * transaction (payment validation and the inventory/cash effects belong
 * to that checkpoint, not here).
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
      const line = await tx.saleLine.create({
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
      return { ...sale, lines: [line] };
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

      const sale = await this.recomputeTotal(tx, businessId, saleId);
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.line_added",
        targetType: "sale",
        targetId: saleId,
        after: { productId: product.id, quantity: dto.quantity, total: sale.total },
        correlationId,
      });
      return sale;
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

      const sale = await this.recomputeTotal(tx, businessId, saleId);
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.line_quantity_updated",
        targetType: "sale",
        targetId: saleId,
        before: { lineId, quantity: line.quantity },
        after: { lineId, quantity, total: sale.total },
        correlationId,
      });
      return sale;
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

      const sale = await this.recomputeTotal(tx, businessId, saleId);
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "sale.line_removed",
        targetType: "sale",
        targetId: saleId,
        after: { lineId, total: sale.total },
        correlationId,
      });
      return sale;
    });
  }

  /** Explicit cashier cancellation of a sale before it ever completes -- SPECS.md 12.2's cancellation of an already-*completed* sale (with its reversal effects) is ROADMAP.md's later "add audited cancellations and refunds" checkpoint, not this one. */
  async cancel(actingUserId: string, businessId: string, saleId: string, correlationId: string) {
    await this.memberships.requirePermission(actingUserId, businessId, "sales.cancel");
    await this.requireInProgress(businessId, saleId);
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.update({
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
      return sale;
    });
  }

  /**
   * The `in_progress` -> `completed` transition only -- validates the
   * aggregate's own invariants (must still be in progress, must have at
   * least one line) and nothing else. Takes the caller's transaction
   * client rather than opening its own: ROADMAP.md's later "settle sales
   * with stock and cash effects" checkpoint is what actually calls this,
   * as one step inside its own single atomic "complete sale" command
   * (payment/inventory/cash effects and their own audit record are that
   * checkpoint's responsibility, not this method's).
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
    return tx.sale.update({
      where: { id: saleId },
      data: { status: "completed", completedAt: this.clock.now() },
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
    const sale = await this.requireSale(businessId, saleId);
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
    return this.requireSale(businessId, saleId);
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

  private async requireSale(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { lines: true },
    });
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
    const sale = await this.requireSale(businessId, saleId);
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

  private async recomputeTotal(tx: Prisma.TransactionClient, businessId: string, saleId: string) {
    const lines = await tx.saleLine.findMany({ where: { saleId } });
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    return tx.sale.update({ where: { id: saleId }, data: { total }, include: { lines: true } });
  }
}
