import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.");
  }
  return url;
}

/**
 * Thin NestJS lifecycle wrapper around PrismaClient. This is the only
 * place that should construct PrismaClient directly -- every module
 * injects PrismaService instead (see ARCHITECTURE.md "Financial
 * settlement": modules record their own facts through their own
 * application services, not by reaching into another module's tables).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
