/**
 * Local-development-only convenience seed: a dev owner account and a
 * "Dev Kiosk" business, so `pnpm dev` has something to log into and click
 * around immediately. Explicitly NEVER for staging/production (ROADMAP.md
 * Phase 1: "Seed a kiosk business for local development only"); the guard
 * below throws rather than silently no-op'ing so a misconfigured
 * environment fails loudly instead of quietly creating throwaway data.
 *
 * Hand-constructs the application services it needs instead of booting a
 * full Nest application context. Every service used here has a plain,
 * dependency-free-of-Nest constructor (PrismaService, PasswordHasherService,
 * Uuidv7Generator take none; the rest just take those) precisely so this
 * script can run without Nest's DI container -- Nest's constructor
 * injection depends on TypeScript's `emitDecoratorMetadata`, which the
 * lightweight `tsx` runner (esbuild-based) does not implement, unlike the
 * `tsc` build NestJS itself uses.
 */
import "reflect-metadata";
import "dotenv/config";
import { Uuidv7Generator } from "@bmp/domain";
import { BusinessesService } from "../src/businesses/businesses.service";
import { PasswordHasherService } from "../src/identity/password-hasher.service";
import { UsersService } from "../src/identity/users.service";
import { MembershipsService } from "../src/memberships/memberships.service";
import { PermissionsService } from "../src/memberships/permissions.service";
import { RolesService } from "../src/memberships/roles.service";
import { PrismaService } from "../src/prisma/prisma.service";

const DEV_OWNER_EMAIL = "owner@dev-kiosk.local";
const DEV_OWNER_PASSWORD = "dev-password-123";
const DEV_BUSINESS_NAME = "Dev Kiosk";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-kiosk must not be run in production (ROADMAP.md Phase 1).");
  }

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const ids = new Uuidv7Generator();
    const passwordHasher = new PasswordHasherService();
    const users = new UsersService(prisma, passwordHasher, ids);
    const permissions = new PermissionsService(prisma);
    const roles = new RolesService(prisma, new MembershipsService(prisma, users, ids), ids);
    const memberships = new MembershipsService(prisma, users, ids);
    const businesses = new BusinessesService(prisma, permissions, roles, memberships, ids);

    const existingOwner = await users.findByEmail(DEV_OWNER_EMAIL);
    if (existingOwner) {
      console.log(`[seed-kiosk] ${DEV_OWNER_EMAIL} already exists, skipping (idempotent).`);
      return;
    }

    const owner = await users.create({ email: DEV_OWNER_EMAIL, password: DEV_OWNER_PASSWORD });
    const business = await businesses.create(owner.id, { name: DEV_BUSINESS_NAME });

    console.log(`[seed-kiosk] Created business "${business.name}" (${business.id}).`);
    console.log(`[seed-kiosk] Owner login: ${DEV_OWNER_EMAIL} / ${DEV_OWNER_PASSWORD}`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error("[seed-kiosk] failed:", error);
  process.exitCode = 1;
});
