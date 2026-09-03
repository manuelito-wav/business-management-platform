import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  isValidMoneyAmount,
  resolvePricing,
  salePriceForTargetMarginPercent,
  salePriceForTargetProfit,
  type IdGenerator,
  type PricingInputMode,
} from "@bmp/domain";
import { ProductsService } from "../catalog/products.service";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertPricingDto } from "./dto/upsert-pricing.dto";

interface ExistingPricing {
  id: string;
  costPrice: number;
  salePrice: number;
  inputMode: PricingInputMode;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly products: ProductsService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async findOne(actingUserId: string, businessId: string, productId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    await this.products.requireInBusiness(businessId, productId);

    const pricing = await this.prisma.productPricing.findUnique({
      where: { productId_businessId: { productId, businessId } },
    });
    if (!pricing) {
      throw new AppException(
        "PRODUCT_PRICING_NOT_FOUND",
        "Pricing has not been set for this product yet.",
        HttpStatus.NOT_FOUND,
      );
    }
    return pricing;
  }

  /**
   * D-007: a single call drives at most one change -- see UpsertPricingDto's
   * doc comment for the four accepted shapes. Creates the pricing record on
   * the product's first call, updates it (in place) afterwards.
   */
  async upsert(actingUserId: string, businessId: string, productId: string, dto: UpsertPricingDto) {
    await this.memberships.requirePermission(actingUserId, businessId, "pricing.manage");
    await this.products.requireInBusiness(businessId, productId);

    const driverCount = [dto.salePrice, dto.profit, dto.marginPercentBasisPoints].filter(
      (value) => value !== undefined,
    ).length;
    if (driverCount > 1) {
      throw new AppException(
        "PRODUCT_PRICING_AMBIGUOUS_DRIVER",
        "Provide at most one of salePrice, profit, or marginPercentBasisPoints per request.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.prisma.productPricing.findUnique({
      where: { productId_businessId: { productId, businessId } },
    });

    if (existing) {
      return this.applyUpdate(businessId, productId, existing, dto, driverCount);
    }
    return this.applyCreate(businessId, productId, dto, driverCount);
  }

  private async applyCreate(
    businessId: string,
    productId: string,
    dto: UpsertPricingDto,
    driverCount: number,
  ) {
    if (dto.costPrice === undefined || driverCount === 0) {
      throw new AppException(
        "PRODUCT_PRICING_INITIAL_VALUES_REQUIRED",
        "Setting pricing for a product for the first time requires costPrice and exactly one of salePrice, profit, or marginPercentBasisPoints.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const costPrice = dto.costPrice;
    const { salePrice, inputMode } = this.resolveDrivenSalePrice(costPrice, dto);
    return this.persist(businessId, productId, null, costPrice, salePrice, inputMode);
  }

  private async applyUpdate(
    businessId: string,
    productId: string,
    existing: ExistingPricing,
    dto: UpsertPricingDto,
    driverCount: number,
  ) {
    if (dto.costPrice !== undefined && driverCount > 0) {
      throw new AppException(
        "PRODUCT_PRICING_AMBIGUOUS_UPDATE",
        "Change costPrice and a target value (salePrice, profit, or marginPercentBasisPoints) in separate requests -- a cost change always preserves the existing sale price (D-007).",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.costPrice === undefined && driverCount === 0) {
      throw new AppException(
        "PRODUCT_PRICING_EMPTY_UPDATE",
        "Provide costPrice, or exactly one of salePrice, profit, or marginPercentBasisPoints.",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.costPrice !== undefined) {
      // Cost-only update (D-007's fourth, unconditional case): preserve
      // the existing sale price and input mode, only recompute profit/
      // Margin % (done uniformly in `persist`).
      return this.persist(
        businessId,
        productId,
        existing,
        dto.costPrice,
        existing.salePrice,
        existing.inputMode,
      );
    }

    const { salePrice, inputMode } = this.resolveDrivenSalePrice(existing.costPrice, dto);
    return this.persist(businessId, productId, existing, existing.costPrice, salePrice, inputMode);
  }

  /** Exactly one of dto.salePrice/profit/marginPercentBasisPoints must be defined -- callers only reach this once driverCount === 1 has already been established. */
  private resolveDrivenSalePrice(
    costPrice: number,
    dto: UpsertPricingDto,
  ): { salePrice: number; inputMode: PricingInputMode } {
    if (dto.salePrice !== undefined) {
      return { salePrice: dto.salePrice, inputMode: "sale_price" };
    }
    if (dto.profit !== undefined) {
      return { salePrice: salePriceForTargetProfit(costPrice, dto.profit), inputMode: "profit" };
    }
    if (dto.marginPercentBasisPoints !== undefined) {
      if (costPrice === 0) {
        throw new AppException(
          "PRODUCT_PRICING_MARGIN_UNDEFINED_AT_ZERO_COST",
          "Margin %-target pricing is undefined while costPrice is 0 (D-032). Use salePrice or profit instead.",
          HttpStatus.BAD_REQUEST,
        );
      }
      return {
        salePrice: salePriceForTargetMarginPercent(costPrice, dto.marginPercentBasisPoints),
        inputMode: "margin_percent",
      };
    }
    throw new AppException(
      "PRODUCT_PRICING_DRIVER_REQUIRED",
      "Exactly one of salePrice, profit, or marginPercentBasisPoints is required.",
      HttpStatus.BAD_REQUEST,
    );
  }

  private async persist(
    businessId: string,
    productId: string,
    existing: ExistingPricing | null,
    costPrice: number,
    salePrice: number,
    inputMode: PricingInputMode,
  ) {
    if (!isValidMoneyAmount(salePrice)) {
      throw new AppException(
        "PRODUCT_PRICING_INVALID_SALE_PRICE",
        `The resolved sale price (${salePrice}) is not a valid amount -- it must be a non-negative integer (minor units). Adjust the target profit or Margin % so the resulting sale price stays non-negative.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Always the single source of truth for profit/Margin % (D-006): both
    // are re-derived from (costPrice, salePrice) here, never carried over
    // from a caller's un-rounded request -- see resolvePricing's own doc
    // comment on why that matters for target-Margin-% edits.
    const { profit, marginPercentBasisPoints } = resolvePricing(costPrice, salePrice);
    const data = { costPrice, salePrice, profit, marginPercentBasisPoints, inputMode };

    if (existing) {
      return this.prisma.productPricing.update({ where: { id: existing.id }, data });
    }
    try {
      return await this.prisma.productPricing.create({
        data: { id: this.ids.generate(), businessId, productId, ...data },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Two concurrent first-time upsert() calls for the same product
        // both saw no existing row and both attempted a create; the
        // @@unique([productId, businessId]) constraint let only one
        // through. Same race guarded against in CategoriesService/
        // ProductsService's own create() methods.
        throw new AppException(
          "PRODUCT_PRICING_ALREADY_EXISTS",
          "Pricing was already set for this product by a concurrent request. Retry to update it instead.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
}
