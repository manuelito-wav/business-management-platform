import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { HealthService } from "./health.service";

/**
 * Integration test against the local docker-compose PostgreSQL service
 * (see docker-compose.yml). This is the checkpoint's own scope -- proving
 * the workspace's database connectivity actually works, not a mock.
 */
describe("HealthService", () => {
  let healthService: HealthService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [HealthService],
    }).compile();

    healthService = moduleRef.get(HealthService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports the database as connected when it can run a query", async () => {
    const result = await healthService.check();

    expect(result).toEqual({ status: "ok", database: "connected" });
  });
});
