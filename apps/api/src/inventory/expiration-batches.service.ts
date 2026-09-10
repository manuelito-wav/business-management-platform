import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Clock, IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { ProductsService } from "../catalog/products.service";
import { AppException } from "../common/app-exception";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExpirationBatchDto } from "./dto/create-expiration-batch.dto";

export interface ExpirationAlertView {
  batchId: string;
  productId: string;
  productName: string;
  quantity: number;
  expiresAt: Date;
  status: "expired" | "near_expiration";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Product/batch expiration tracking (ROADMAP.md "add optional expiration
 * tracking"; SPECS.md 8.4). Deliberately a separate service from
 * InventoryService, never calling recordMovement or touching
 * InventoryMovement/ProductStock -- ROADMAP.md "Keep this isolated from
 * the non-expiration inventory path". Batches are metadata for alerting
 * only; the actual stock effect of discarding expired product still goes
 * through the existing, separate InventoryService.recordLoss (lossReason
 * "expiration"), a deliberate manual step: SPECS.md 8.4 "alerts are
 * warnings, not automatic proof that physical stock still exists" -- an
 * authorized user must physically verify before any stock effect.
 */
@Injectable()
export class ExpirationBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly products: ProductsService,
    private readonly configuration: ConfigurationService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Requires both the business (featureFlags.expirationTracking) and the product (Product.expirationTrackingEnabled) to have opted in. Gated by `inventory.adjust`, the same permission as receiveStock/adjustStock -- logging a batch is an inventory-management action, not a new privileged category. */
  async createBatch(
    actingUserId: string,
    businessId: string,
    productId: string,
    dto: CreateExpirationBatchDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "inventory.adjust");
    const product = await this.products.requireInBusiness(businessId, productId);
    await this.requireExpirationTrackingEnabled(businessId, product);

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.productExpirationBatch.create({
        data: {
          id: this.ids.generate(),
          businessId,
          productId,
          quantity: dto.quantity,
          expiresAt: new Date(dto.expiresAt),
          actorUserId: actingUserId,
          correlationId,
        },
      });

      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "expiration_batch.created",
        targetType: "expiration_batch",
        targetId: batch.id,
        after: { productId, quantity: batch.quantity, expiresAt: batch.expiresAt },
        correlationId,
      });

      return batch;
    });
  }

  /**
   * Records that an authorized user completed the "alert -> physical
   * verification -> decision" workflow (SPECS.md 8.4) -- purely
   * bookkeeping, no stock effect. Not gated on the feature still being
   * enabled: existing batches must stay resolvable even if a business
   * later disables expiration tracking.
   */
  async resolveBatch(
    actingUserId: string,
    businessId: string,
    productId: string,
    batchId: string,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "inventory.adjust");
    const existing = await this.requireBatchInBusiness(businessId, productId, batchId);
    if (existing.resolvedAt) {
      throw new AppException(
        "EXPIRATION_BATCH_ALREADY_RESOLVED",
        "This expiration batch was already resolved.",
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.productExpirationBatch.update({
        where: { id: batchId },
        data: { resolvedAt: this.clock.now() },
      });

      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "expiration_batch.resolved",
        targetType: "expiration_batch",
        targetId: batch.id,
        before: { resolvedAt: null },
        after: { resolvedAt: batch.resolvedAt },
        correlationId,
      });

      return batch;
    });
  }

  /**
   * Every unresolved batch that is already expired or falls within the
   * business's configured near-expiration window (SPECS.md 8.4). Purely
   * informational -- see the class doc comment; never mutates stock.
   */
  async listAlerts(actingUserId: string, businessId: string): Promise<ExpirationAlertView[]> {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    const { expirationPolicy } = await this.configuration.getSections(businessId);

    const now = this.clock.now();
    const nearExpirationCutoff = new Date(
      now.getTime() + expirationPolicy.nearExpirationWindowDays * MS_PER_DAY,
    );

    const batches = await this.prisma.productExpirationBatch.findMany({
      where: { businessId, resolvedAt: null, expiresAt: { lte: nearExpirationCutoff } },
      orderBy: { expiresAt: "asc" },
    });
    if (batches.length === 0) {
      return [];
    }

    const products = await this.products.findManyByIds(
      businessId,
      batches.map((batch) => batch.productId),
    );
    const productsById = new Map(products.map((product) => [product.id, product]));

    return batches.flatMap((batch) => {
      // Defensive: the composite FK guarantees this product exists in the
      // same business, so it is always found here.
      const product = productsById.get(batch.productId);
      if (!product) {
        return [];
      }
      return [
        {
          batchId: batch.id,
          productId: batch.productId,
          productName: product.name,
          quantity: batch.quantity,
          expiresAt: batch.expiresAt,
          status: batch.expiresAt < now ? ("expired" as const) : ("near_expiration" as const),
        },
      ];
    });
  }

  private async requireExpirationTrackingEnabled(
    businessId: string,
    product: { expirationTrackingEnabled: boolean },
  ): Promise<void> {
    const { featureFlags } = await this.configuration.getSections(businessId);
    if (!featureFlags.expirationTracking) {
      throw new AppException(
        "EXPIRATION_TRACKING_DISABLED",
        "Expiration tracking is not enabled for this business. An Administrator must enable featureFlags.expirationTracking first.",
        HttpStatus.FORBIDDEN,
      );
    }
    if (!product.expirationTrackingEnabled) {
      throw new AppException(
        "PRODUCT_EXPIRATION_TRACKING_DISABLED",
        "This product does not have expiration tracking enabled.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async requireBatchInBusiness(businessId: string, productId: string, batchId: string) {
    const batch = await this.prisma.productExpirationBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.businessId !== businessId || batch.productId !== productId) {
      throw new AppException(
        "EXPIRATION_BATCH_NOT_FOUND",
        "Expiration batch not found for this product.",
        HttpStatus.NOT_FOUND,
      );
    }
    return batch;
  }
}
