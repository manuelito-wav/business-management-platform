import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { ProductsService } from "../catalog/products.service";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { ConfigurationService } from "../configuration/configuration.service";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePriceListDto } from "./dto/create-price-list.dto";
import { SetPriceListEntryDto } from "./dto/set-price-list-entry.dto";
import { UpdatePriceListDto } from "./dto/update-price-list.dto";

export interface EffectivePrice {
  salePrice: number;
  source: "price_list" | "default";
  priceListId: string | null;
}

/**
 * Optional, disabled-by-default price lists (SPECS.md 7.5/19.1). Reuses
 * `pricing.manage` (ARCHITECTURE.md does not list "price lists" as a
 * module separate from "pricing") -- reads are open to any active
 * member, same as the rest of catalog/pricing. See schema.prisma's
 * PriceList/PriceListEntry doc comments for the data model, and
 * `resolveEffectivePrice`'s own doc comment for the "selection boundary"
 * ROADMAP.md asks for.
 */
@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly products: ProductsService,
    private readonly configuration: ConfigurationService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async list(actingUserId: string, businessId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.prisma.priceList.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  async create(
    actingUserId: string,
    businessId: string,
    dto: CreatePriceListDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "pricing.manage");
    await this.requireFeatureEnabled(businessId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const priceList = await tx.priceList.create({
          data: { id: this.ids.generate(), businessId, name: dto.name },
        });
        await this.audit.record(tx, {
          businessId,
          actorUserId: actingUserId,
          action: "price_list.created",
          targetType: "price_list",
          targetId: priceList.id,
          after: { name: priceList.name, status: priceList.status },
          correlationId,
        });
        return priceList;
      });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async update(
    actingUserId: string,
    businessId: string,
    priceListId: string,
    dto: UpdatePriceListDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "pricing.manage");
    await this.requireFeatureEnabled(businessId);
    const existing = await this.requireInBusiness(businessId, priceListId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.priceList.update({
          where: { id: priceListId },
          data: { name: dto.name, status: dto.status },
        });
        await this.audit.record(tx, {
          businessId,
          actorUserId: actingUserId,
          action: "price_list.updated",
          targetType: "price_list",
          targetId: priceListId,
          before: { name: existing.name, status: existing.status },
          after: { name: updated.name, status: updated.status },
          correlationId,
        });
        return updated;
      });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async setEntry(
    actingUserId: string,
    businessId: string,
    priceListId: string,
    productId: string,
    dto: SetPriceListEntryDto,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "pricing.manage");
    await this.requireFeatureEnabled(businessId);
    await this.requireInBusiness(businessId, priceListId);
    await this.products.requireInBusiness(businessId, productId);

    return this.prisma.$transaction(async (tx) => {
      const existingEntry = await tx.priceListEntry.findUnique({
        where: { priceListId_productId: { priceListId, productId } },
      });
      const entry = await tx.priceListEntry.upsert({
        where: { priceListId_productId: { priceListId, productId } },
        create: {
          id: this.ids.generate(),
          businessId,
          priceListId,
          productId,
          salePrice: dto.salePrice,
        },
        update: { salePrice: dto.salePrice },
      });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: existingEntry ? "price_list_entry.updated" : "price_list_entry.created",
        targetType: "price_list_entry",
        targetId: entry.id,
        before: existingEntry ? { salePrice: existingEntry.salePrice } : undefined,
        after: { salePrice: entry.salePrice },
        correlationId,
      });
      return entry;
    });
  }

  async removeEntry(
    actingUserId: string,
    businessId: string,
    priceListId: string,
    productId: string,
    correlationId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "pricing.manage");
    await this.requireFeatureEnabled(businessId);
    await this.requireInBusiness(businessId, priceListId);

    const entry = await this.prisma.priceListEntry.findUnique({
      where: { priceListId_productId: { priceListId, productId } },
    });
    if (!entry) {
      throw new AppException(
        "PRICE_LIST_ENTRY_NOT_FOUND",
        "No override price is set for this product in this price list.",
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.priceListEntry.delete({ where: { id: entry.id } });
      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "price_list_entry.removed",
        targetType: "price_list_entry",
        targetId: entry.id,
        before: { salePrice: entry.salePrice },
        correlationId,
      });
    });
  }

  /**
   * The "selection boundary" ROADMAP.md's price-list checkpoint asks
   * for: resolves the sale price a caller should charge for a product,
   * optionally overridden by one price list. Falls back to the
   * product's default ProductPricing.salePrice whenever no priceListId
   * is given, the business has not enabled featureFlags.priceLists, the
   * price list is inactive, or the list has no override entry for this
   * product -- a price list has *no effect at all* while the feature is
   * disabled, matching ROADMAP.md's "keep the feature ... out of the
   * initial POS flow until enabled per business". Nothing calls this
   * yet: Phase 8's "enable configurable price lists" checkpoint is what
   * wires selection into a live sale and snapshots the result onto a
   * sale line (D-034-adjacent -- that snapshot, once it exists, is what
   * a historical sale actually depends on, never a live re-resolution).
   */
  async resolveEffectivePrice(
    actingUserId: string,
    businessId: string,
    productId: string,
    priceListId?: string,
  ): Promise<EffectivePrice> {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    await this.products.requireInBusiness(businessId, productId);

    const defaultPricing = await this.prisma.productPricing.findUnique({
      where: { productId_businessId: { productId, businessId } },
    });
    if (!defaultPricing) {
      throw new AppException(
        "PRODUCT_PRICING_NOT_FOUND",
        "Pricing has not been set for this product yet.",
        HttpStatus.NOT_FOUND,
      );
    }

    if (priceListId) {
      const { featureFlags } = await this.configuration.getSections(businessId);
      if (featureFlags.priceLists) {
        const priceList = await this.requireInBusiness(businessId, priceListId);
        if (priceList.status === "active") {
          const entry = await this.prisma.priceListEntry.findUnique({
            where: { priceListId_productId: { priceListId, productId } },
          });
          if (entry) {
            return { salePrice: entry.salePrice, source: "price_list", priceListId };
          }
        }
      }
    }

    return { salePrice: defaultPricing.salePrice, source: "default", priceListId: null };
  }

  private async requireFeatureEnabled(businessId: string) {
    const { featureFlags } = await this.configuration.getSections(businessId);
    if (!featureFlags.priceLists) {
      throw new AppException(
        "PRICE_LISTS_DISABLED",
        "Price lists are not enabled for this business. An Administrator must enable featureFlags.priceLists first.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async requireInBusiness(businessId: string, priceListId: string) {
    const priceList = await this.prisma.priceList.findUnique({ where: { id: priceListId } });
    if (!priceList || priceList.businessId !== businessId) {
      throw new AppException(
        "PRICE_LIST_NOT_FOUND",
        "Price list not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return priceList;
  }

  private mapDuplicateNameError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new AppException(
        "PRICE_LIST_NAME_ALREADY_EXISTS",
        "A price list with this name already exists in this business.",
        HttpStatus.CONFLICT,
      );
    }
    return error;
  }
}
