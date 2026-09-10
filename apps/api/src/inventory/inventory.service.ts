import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { ProductsService } from "../catalog/products.service";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import type { InventoryMovementReason } from "../generated/prisma/client";
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
}

export interface ProductStockView {
  productId: string;
  quantityOnHand: number;
  updatedAt: Date | null;
}

/**
 * The inventory ledger's foundation (ROADMAP.md "add inventory movement
 * ledger"): a low-level, trusted-caller writer. `recordMovement` does not
 * itself check membership/permission, and -- deliberately -- does not
 * call AuditService.record either: ARCHITECTURE.md's "Financial
 * settlement" section treats "audit" as one fact per coordinated command,
 * alongside (not duplicated per) the sale/payment/inventory/cash facts it
 * produces, and a single future command (e.g. a sale with several line
 * items) may call `recordMovement` more than once. D-042 ("every
 * finalized command that changes tenant-owned state produces an audit
 * record") is therefore the CALLER's responsibility here: every future
 * caller (ROADMAP.md's next checkpoint, "add stock adjustments and
 * losses", and later sale settlement) must validate permission and call
 * AuditService.record itself, inside the same transaction, exactly like
 * PricingService validates `pricing.manage` and calls AuditService.record
 * around its own `persist`. `recordMovement` does still defend the
 * tenant-consistency invariant itself (AUDIT.md Tenancy: "All entities in
 * a composite operation share the same business_id, validated in the same
 * transaction") by re-checking the product's business inside the same tx
 * -- that part is safe to centralize because it never varies by caller.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly products: ProductsService,
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
  ): Promise<{ id: string }> {
    if (!Number.isInteger(input.quantity) || input.quantity === 0) {
      throw new AppException(
        "INVALID_INVENTORY_MOVEMENT_QUANTITY",
        "quantity must be a non-zero integer.",
        HttpStatus.BAD_REQUEST,
      );
    }

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
        sourceOperationId: input.sourceOperationId,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
      },
    });

    await tx.productStock.upsert({
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

    return { id: movement.id };
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
}
