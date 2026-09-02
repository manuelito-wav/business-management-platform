import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async create(actingUserId: string, businessId: string, dto: CreateCategoryDto) {
    await this.memberships.requirePermission(actingUserId, businessId, "catalog.manage");

    try {
      return await this.prisma.category.create({
        data: { id: this.ids.generate(), businessId, name: dto.name },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          "CATEGORY_NAME_ALREADY_EXISTS",
          "A category with this name already exists in this business.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(
    actingUserId: string,
    businessId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ) {
    await this.memberships.requirePermission(actingUserId, businessId, "catalog.manage");
    await this.requireInBusiness(businessId, categoryId);

    try {
      return await this.prisma.category.update({
        where: { id: categoryId },
        data: { name: dto.name, status: dto.status },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppException(
          "CATEGORY_NAME_ALREADY_EXISTS",
          "A category with this name already exists in this business.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async list(actingUserId: string, businessId: string) {
    await this.memberships.requireActiveMembership(actingUserId, businessId);
    return this.prisma.category.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  /** Also used by ProductsService to validate a product's categoryId belongs to the same business. */
  async requireInBusiness(businessId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.businessId !== businessId) {
      throw new AppException(
        "CATEGORY_NOT_FOUND",
        "Category not found in this business.",
        HttpStatus.NOT_FOUND,
      );
    }
    return category;
  }
}
