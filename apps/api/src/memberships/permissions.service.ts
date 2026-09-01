import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PERMISSION_CATALOG } from "./permission-catalog";

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently provisions the permission catalog. There is no separate
   * deployment/seed pipeline yet in this project, so this runs inline
   * before a business is created rather than depending on an external
   * step -- `skipDuplicates` makes repeated calls (including concurrent
   * business creations) safe.
   */
  async ensureCatalogSeeded(): Promise<void> {
    await this.prisma.permission.createMany({
      data: [...PERMISSION_CATALOG],
      skipDuplicates: true,
    });
  }

  list() {
    return this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
  }
}
