import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { ProductsService } from "../catalog/products.service";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import type {
  InventoryLossReason,
  InventoryMovement,
  InventoryMovementReason,
  ProductStock,
} from "../generated/prisma/client";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";

export interface RecordInventoryMovementInput {
  businessId: string;
  productId: string;
  reason: InventoryMovementReason;
  /**
   * Signed delta in the product's own inventory unit -- whole units for
   * saleMode "unit", integer grams for saleMode "weighted" (D-008).
   * Positive increases stock, negative decreases it. Never zero.
   */
  quantity: number;
  actorUserId: string;
  correlationId: string;
  sourceOperationId?: string;
  /** Required exactly when `reason` is "loss", forbidden otherwise (SPECS.md 8.3). */
  lossReason?: InventoryLossReason;
}

export interface RecordMovementResult {
  movement: InventoryMovement;
  stock: ProductStock;
}

export interface ProductStockView {
  productId: string;
  quantityOnHand: number;
  updatedAt: Date | null;
}

export interface StockAlertView {
  productId: string;
  productName: string;
  quantityOnHand: number;
  minimumStock: number | null;
  /** quantityOnHand < 0 (D-015/SPECS.md 8.2) -- unconditional, independent of minimumStock. */
  negative: boolean;
  /** minimumStock is set and quantityOnHand <= minimumStock (SPECS.md 7.3). */
  lowStock: boolean;
}

export interface ReceiveStockInput {
  /** Positive: how many units/grams were received. */
  quantity: number;
  sourceOperationId?: string;
}

export interface AdjustStockInput {
  /** Signed, non-zero: the correction to apply. */
  quantity: number;
}

export interface RecordLossInput {
  /** Positive: how many units/grams were lost -- stored as a negative movement. */
  quantity: number;
  lossReason: InventoryLossReason;
}

/**
 * The inventory ledger's foundation (ROADMAP.md "add inventory movement
 * ledger") plus the first commands built on it (ROADMAP.md "add stock
 * adjustments and losses"). `recordMovement` is a low-level, trusted-caller
 * writer: it does not itself check membership/permission, and --
 * deliberately -- does not call AuditService.record either.
 * ARCHITECTURE.md's "Financial settlement" section treats "audit" as one
 * fact per coordinated command, alongside (not duplicated per) the sale/
 * payment/inventory/cash facts it produces, and a single future command
 * (e.g. a sale with several line items) may call `recordMovement` more
 * than once. D-042 ("every finalized command that changes tenant-owned
 * state produces an audit record") is therefore each *command* method's
 * responsibility (receiveStock/adjustStock/recordLoss below, and later
 * sale settlement): validate permission, then call AuditService.record
 * itself, inside the same transaction -- exactly like PricingService
 * validates `pricing.manage` and calls AuditService.record around its own
 * `persist`. `recordMovement` does still defend the tenant-consistency
 * invariant itself (AUDIT.md Tenancy: "All entities in a composite
 * operation share the same business_id, validated in the same
 * transaction") by re-checking the product's business inside the same tx
 * -- that part is safe to centralize because it never varies by caller.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * Always called with the caller's own transaction client, the same
   * convention as AuditService.record -- the ledger row and the
   * current-stock projection update commit or roll back together with
   * whatever other facts (an audit record, a future sale/cash effect) the
   * caller is writing in the same operation.
   */
  async recordMovement(
    tx: Prisma.TransactionClient,
    input: RecordInventoryMovementInput,
  ): Promise<RecordMovementResult> {
    if (!Number.isInteger(input.quantity) || input.quantity === 0) {
      throw new AppException(
        "INVALID_INVENTORY_MOVEMENT_QUANTITY",
        "quantity must be a non-zero integer.",
        HttpStatus.BAD_REQUEST,
      );
    }
    this.validateLossReason(input.reason, input.lossReason);

    // Not ProductsService.requireInBusiness: that method reads through
    // `this.prisma`, not the caller's `tx` -- this check must run inside
    // the same transaction as the write it is guarding.
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product || product.businessId !== input.businessId) {
      throw new AppException(
        "PRODUCT_NOT_FOUND",
        "Product not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        id: this.ids.generate(),
        businessId: input.businessId,
        productId: input.productId,
        reason: input.reason,
        quantity: input.quantity,
        lossReason: input.lossReason,
        sourceOperationId: input.sourceOperationId,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
      },
    });

    const stock = await tx.productStock.upsert({
      where: {
        productId_businessId: { productId: input.productId, businessId: input.businessId },
      },
      create: {
        id: this.ids.generate(),
        businessId: input.businessId,
        productId: input.productId,
        quantityOnHand: input.quantity,
      },
      update: { quantityOnHand: { increment: input.quantity } },
    });

    return { movement, stock };
  }

  /**
   * Receiving/purchase (SPECS.md 8.1): always increases stock. Gated by
   * `inventory.adjust` -- the same permission as adjustStock, matching the
   * single generic code permission-catalog.ts already seeded for this
   * checkpoint (there is no separate "receive" permission).
   */
  async receiveStock(
    actingUserId: string,
    businessId: string,
    productId: string,
    input: ReceiveStockInput,
    correlationId: string,
  ): Promise<RecordMovementResult> {
    await this.memberships.requirePermission(actingUserId, businessId, "inventory.adjust");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new AppException(
        "INVALID_RECEIVING_QUANTITY",
        "quantity must be a positive integer.",
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await this.recordMovement(tx, {
        businessId,
        productId,
        actorUserId: actingUserId,
        correlationId,
        reason: "receiving",
        quantity: input.quantity,
        sourceOperationId: input.sourceOperationId,
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "inventory_movement.received",
        targetType: "inventory_movement",
        targetId: result.movement.id,
        after: {
          productId,
          quantity: result.movement.quantity,
          sourceOperationId: result.movement.sourceOperationId,
        },
        correlationId,
      });
      return result;
    });
  }

  /**
   * Manual adjustment (SPECS.md 8.1): a signed correction, positive or
   * negative -- e.g. fixing a miscount. Gated by `inventory.adjust`.
   */
  async adjustStock(
    actingUserId: string,
    businessId: string,
    productId: string,
    input: AdjustStockInput,
    correlationId: string,
  ): Promise<RecordMovementResult> {
    await this.memberships.requirePermission(actingUserId, businessId, "inventory.adjust");

    return this.prisma.$transaction(async (tx) => {
      const result = await this.recordMovement(tx, {
        businessId,
        productId,
        actorUserId: actingUserId,
        correlationId,
        reason: "manual_adjustment",
        quantity: input.quantity,
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "inventory_movement.adjusted",
        targetType: "inventory_movement",
        targetId: result.movement.id,
        after: { productId, quantity: result.movement.quantity },
        correlationId,
      });
      return result;
    });
  }

  /**
   * Dedicated stock loss (SPECS.md 8.3): the caller reports a positive
   * "amount lost", stored as a negative movement -- loss always decreases
   * stock, never increases it. Gated by `inventory.record_loss`, distinct
   * from `inventory.adjust` (SPECS.md's dedicated loss area).
   */
  async recordLoss(
    actingUserId: string,
    businessId: string,
    productId: string,
    input: RecordLossInput,
    correlationId: string,
  ): Promise<RecordMovementResult> {
    await this.memberships.requirePermission(actingUserId, businessId, "inventory.record_loss");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new AppException(
        "INVALID_LOSS_QUANTITY",
        "quantity must be a positive integer (the amount lost).",
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await this.recordMovement(tx, {
        businessId,
        productId,
        actorUserId: actingUserId,
        correlationId,
        reason: "loss",
        quantity: -input.quantity,
        lossReason: input.lossReason,
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "inventory_movement.loss_recorded",
        targetType: "inventory_movement",
        targetId: result.movement.id,
        after: {
          productId,
          quantity: result.movement.quantity,
          lossReason: result.movement.lossReason,
        },
        correlationId,
      });
      return result;
    });
  }

  async getStock(
    actingUserId: string,
    businessId: string,
    productId: string,
  ): Promise<ProductStockView> {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    await this.products.requireInBusiness(businessId, productId);

    const stock = await this.prisma.productStock.findUnique({
      where: { productId_businessId: { productId, businessId } },
    });

    // No row yet means no movement has ever been recorded for this
    // product -- that is a legitimate zero, not a 404.
    return {
      productId,
      quantityOnHand: stock?.quantityOnHand ?? 0,
      updatedAt: stock?.updatedAt ?? null,
    };
  }

  /**
   * Every product currently needing attention (ROADMAP.md "support
   * negative stock and alerts"): negative stock is unconditionally
   * flagged (D-015/SPECS.md 8.2 -- "an operational discrepancy", true
   * regardless of whether the product tracks a minimum), and separately
   * a product whose stock has fallen to or below its own configured
   * `minimumStock` (SPECS.md 7.3) -- products that never set one never
   * appear on that basis. A product may match both; each is reported
   * once with both flags. This is a query, not a persisted alert/
   * notification record -- SPECS.md's notification architecture (the
   * "Low stock" example) is Phase 8's job; a future Dashboard checkpoint
   * (ROADMAP.md Phase 5) is expected to poll this.
   *
   * Reads its own productStock table directly, but resolves product
   * names/minimumStock through ProductsService's own methods rather than
   * `this.prisma.product...` -- InventoryModule does not read the
   * products table itself (ARCHITECTURE.md "Modules").
   */
  async listStockAlerts(actingUserId: string, businessId: string): Promise<StockAlertView[]> {
    await this.memberships.requireActiveMembership(actingUserId, businessId);

    const [negativeStockRows, lowStockCandidates] = await Promise.all([
      this.prisma.productStock.findMany({ where: { businessId, quantityOnHand: { lt: 0 } } }),
      this.products.listWithMinimumStockConfigured(businessId),
    ]);

    const negativeProducts = await this.products.findManyByIds(
      businessId,
      negativeStockRows.map((row) => row.productId),
    );
    const negativeProductsById = new Map(negativeProducts.map((product) => [product.id, product]));

    const alertsByProductId = new Map<string, StockAlertView>();

    for (const row of negativeStockRows) {
      // Defensive: the composite FK guarantees this product exists in the
      // same business, so it is always found here.
      const product = negativeProductsById.get(row.productId);
      if (!product) {
        continue;
      }
      alertsByProductId.set(row.productId, {
        productId: row.productId,
        productName: product.name,
        quantityOnHand: row.quantityOnHand,
        minimumStock: product.minimumStock,
        negative: true,
        lowStock: product.minimumStock !== null && row.quantityOnHand <= product.minimumStock,
      });
    }

    if (lowStockCandidates.length > 0) {
      const candidateStockRows = await this.prisma.productStock.findMany({
        where: { businessId, productId: { in: lowStockCandidates.map((product) => product.id) } },
      });
      const quantityByProductId = new Map(
        candidateStockRows.map((row) => [row.productId, row.quantityOnHand]),
      );

      for (const product of lowStockCandidates) {
        const quantityOnHand = quantityByProductId.get(product.id) ?? 0;
        // minimumStock is non-null by listWithMinimumStockConfigured's own where clause.
        if (quantityOnHand > product.minimumStock!) {
          continue;
        }
        const existing = alertsByProductId.get(product.id);
        alertsByProductId.set(product.id, {
          productId: product.id,
          productName: product.name,
          quantityOnHand,
          minimumStock: product.minimumStock,
          negative: existing?.negative ?? quantityOnHand < 0,
          lowStock: true,
        });
      }
    }

    return [...alertsByProductId.values()];
  }

  /**
   * Recomputes `quantityOnHand` from scratch by summing every movement in
   * the ledger, then overwrites the projection with that exact value --
   * the ledger is always the source of truth (ARCHITECTURE.md
   * "Inventory"). Used to verify the projection matches the ledger (tests)
   * and to repair drift if it is ever found (admin tooling); nothing in
   * this checkpoint calls it automatically, since `recordMovement` already
   * keeps the projection in sync transactionally on every write.
   */
  async reconcileStock(businessId: string, productId: string): Promise<ProductStockView> {
    await this.products.requireInBusiness(businessId, productId);

    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.inventoryMovement.aggregate({
        where: { businessId, productId },
        _sum: { quantity: true },
      });
      const quantityOnHand = aggregate._sum.quantity ?? 0;

      const stock = await tx.productStock.upsert({
        where: { productId_businessId: { productId, businessId } },
        create: { id: this.ids.generate(), businessId, productId, quantityOnHand },
        update: { quantityOnHand },
      });

      return { productId, quantityOnHand: stock.quantityOnHand, updatedAt: stock.updatedAt };
    });
  }

  /**
   * D-008-style conditional requirement (mirrors
   * ProductsService.resolveWeightUnit exactly): a loss movement must
   * carry a lossReason, and no other movement reason may.
   */
  private validateLossReason(
    reason: InventoryMovementReason,
    lossReason: InventoryLossReason | undefined,
  ): void {
    if (reason === "loss" && !lossReason) {
      throw new AppException(
        "INVENTORY_LOSS_REASON_REQUIRED",
        'A "loss" movement requires a lossReason.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (reason !== "loss" && lossReason) {
      throw new AppException(
        "INVENTORY_LOSS_REASON_NOT_ALLOWED",
        'lossReason is only allowed for "loss" movements.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
