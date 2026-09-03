import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "./categories.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ProductIdentifierInputDto } from "./dto/product-identifier-input.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { normalizeProductIdentifier } from "./product-identifier-normalization";

const DEFAULT_PAGE_LIMIT = 25;

export interface ListProductsOptions {
  search?: string;
  categoryId?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly categories: CategoriesService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async create(actingUserId: string, businessId: string, dto: CreateProductDto) {
    await this.memberships.requirePermission(actingUserId, businessId, "catalog.manage");
    await this.categories.requireInBusiness(businessId, dto.categoryId);

    const saleMode = dto.saleMode ?? "unit";
    const weightUnit = this.resolveWeightUnit(saleMode, dto.weightUnit);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            id: this.ids.generate(),
            businessId,
            categoryId: dto.categoryId,
            name: dto.name,
            description: dto.description,
            saleMode,
            weightUnit,
            imageUrl: dto.imageUrl,
          },
        });

        for (const identifier of dto.identifiers ?? []) {
          await tx.productIdentifier.create({
            data: {
              id: this.ids.generate(),
              businessId,
              productId: product.id,
              type: identifier.type,
              value: identifier.value,
              normalizedValue: normalizeProductIdentifier(identifier.value),
            },
          });
        }

        return tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: { identifiers: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          "PRODUCT_IDENTIFIER_ALREADY_EXISTS",
          "One of these identifiers is already used by another product in this business.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(actingUserId: string, businessId: string, productId: string, dto: UpdateProductDto) {
    await this.memberships.requirePermission(actingUserId, businessId, "catalog.manage");
    const existing = await this.requireInBusiness(businessId, productId);
    if (dto.categoryId) {
      await this.categories.requireInBusiness(businessId, dto.categoryId);
    }

    // Re-validate the *effective* (post-update) saleMode/weightUnit pair,
    // not just the fields present in this particular PATCH -- a request
    // that only flips saleMode must still satisfy the invariant. Always
    // writing the resolved value (rather than only when dto.weightUnit is
    // present) is what clears a stale weightUnit when a product
    // transitions from weighted back to unit.
    const effectiveSaleMode = dto.saleMode ?? existing.saleMode;
    const weightUnit = this.resolveWeightUnitForUpdate(
      effectiveSaleMode,
      dto.weightUnit,
      existing.weightUnit,
    );

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        saleMode: dto.saleMode,
        weightUnit,
        imageUrl: dto.imageUrl,
        status: dto.status,
      },
      include: { identifiers: true },
    });
  }

  async findOne(actingUserId: string, businessId: string, productId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { identifiers: true },
    });
    if (!product || product.businessId !== businessId) {
      throw new AppException(
        "PRODUCT_NOT_FOUND",
        "Product not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return product;
  }

  /**
   * Ordered alphabetically (unlike the audit trail's chronological feed) --
   * the natural default for browsing a catalog. Still cursor-paginated on
   * `id` (D-041): Prisma resolves the cursor row's position within the
   * full (name, id) ordering, so ties on name are handled correctly
   * without a compound unique index just for pagination.
   */
  async search(actingUserId: string, businessId: string, options: ListProductsOptions) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);

    const limit = options.limit ?? DEFAULT_PAGE_LIMIT;
    const searchTerm = options.search?.trim();

    const rows = await this.prisma.product.findMany({
      where: {
        businessId,
        ...(options.categoryId ? { categoryId: options.categoryId } : {}),
        ...(searchTerm
          ? {
              OR: [
                { name: { contains: searchTerm, mode: "insensitive" } },
                {
                  identifiers: {
                    some: { normalizedValue: { contains: normalizeProductIdentifier(searchTerm) } },
                  },
                },
              ],
            }
          : {}),
      },
      include: { identifiers: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return { data: page, pagination: { nextCursor: hasMore && last ? last.id : null } };
  }

  async addIdentifier(
    actingUserId: string,
    businessId: string,
    productId: string,
    dto: ProductIdentifierInputDto,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "catalog.manage");
    await this.requireInBusiness(businessId, productId);

    try {
      return await this.prisma.productIdentifier.create({
        data: {
          id: this.ids.generate(),
          businessId,
          productId,
          type: dto.type,
          value: dto.value,
          normalizedValue: normalizeProductIdentifier(dto.value),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          "PRODUCT_IDENTIFIER_ALREADY_EXISTS",
          "This identifier is already used by another product in this business.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * A physical delete, not a status transition: an identifier carries no
   * historical/operational weight of its own (D-037's explicit carve-out
   * for data with "no historical or operational dependency" -- unlike the
   * product it is attached to).
   */
  async removeIdentifier(
    actingUserId: string,
    businessId: string,
    productId: string,
    identifierId: string,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "catalog.manage");
    const identifier = await this.prisma.productIdentifier.findUnique({
      where: { id: identifierId },
    });
    if (!identifier || identifier.businessId !== businessId || identifier.productId !== productId) {
      throw new AppException(
        "PRODUCT_IDENTIFIER_NOT_FOUND",
        "Identifier not found on this product.",
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.productIdentifier.delete({ where: { id: identifierId } });
  }

  /**
   * D-008: weightUnit is required exactly when saleMode is "weighted" and
   * forbidden otherwise -- enforced here (service level) rather than as a
   * Postgres CHECK constraint, per the schema doc comment on Product.
   */
  private resolveWeightUnit(
    saleMode: "unit" | "weighted",
    weightUnit: "g" | "kg" | null | undefined,
  ): "g" | "kg" | null {
    if (saleMode === "weighted") {
      if (!weightUnit) {
        throw new AppException(
          "INVALID_WEIGHT_UNIT_CONFIGURATION",
          'A weighted product requires a weightUnit ("g" or "kg").',
          HttpStatus.BAD_REQUEST,
        );
      }
      return weightUnit;
    }
    if (weightUnit) {
      throw new AppException(
        "INVALID_WEIGHT_UNIT_CONFIGURATION",
        "weightUnit is only allowed for weighted products.",
        HttpStatus.BAD_REQUEST,
      );
    }
    return null;
  }

  /**
   * Same invariant as resolveWeightUnit, but for a PATCH: the row's
   * *existing* weightUnit is only a valid source when the effective
   * saleMode is "weighted" (e.g. a PATCH that flips saleMode without
   * repeating weightUnit). When the effective saleMode is "unit", a
   * leftover weightUnit from a prior weighted state is not a client
   * error -- it's silently cleared to null. Only a weightUnit the client
   * *explicitly* sent in this same request is validated as forbidden.
   */
  private resolveWeightUnitForUpdate(
    saleMode: "unit" | "weighted",
    dtoWeightUnit: "g" | "kg" | undefined,
    existingWeightUnit: "g" | "kg" | null,
  ): "g" | "kg" | null {
    if (saleMode === "weighted") {
      return this.resolveWeightUnit(
        saleMode,
        dtoWeightUnit !== undefined ? dtoWeightUnit : existingWeightUnit,
      );
    }
    if (dtoWeightUnit !== undefined) {
      return this.resolveWeightUnit(saleMode, dtoWeightUnit);
    }
    return null;
  }

  private async requireInBusiness(businessId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.businessId !== businessId) {
      throw new AppException(
        "PRODUCT_NOT_FOUND",
        "Product not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return product;
  }
}
