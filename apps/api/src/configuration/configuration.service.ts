import { Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AuditService } from "../audit/audit.service";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { MembershipsService } from "../memberships/memberships.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CONFIGURATION_KEYS,
  CONFIGURATION_REGISTRY,
  resolveConfigurationSection,
  type ConfigurationKey,
  type ConfigurationSections,
} from "./configuration-registry";

@Injectable()
export class ConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly audit: AuditService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async getSections(businessId: string): Promise<ConfigurationSections> {
    const rows = await this.prisma.businessConfiguration.findMany({ where: { businessId } });
    const storedByKey = new Map(rows.map((row) => [row.key, row.value]));

    // Object.fromEntries's return type is always the loose `{ [k: string]: V }`
    // shape regardless of how precisely-typed `entries` is -- the same
    // "TypeScript can't correlate a generic mapped-type write with a
    // runtime union key" limitation resolveConfigurationSection's own
    // comment describes, just on the assembling side rather than the
    // per-key resolution side. One cast back to ConfigurationSections at
    // this single boundary, not scattered per-field.
    const entries = CONFIGURATION_KEYS.map(
      (key) => [key, resolveConfigurationSection(key, storedByKey.get(key))] as const,
    );
    return Object.fromEntries(entries) as ConfigurationSections;
  }

  /**
   * Applies a partial set of section updates for one business. The
   * values themselves are already validated by UpdateConfigurationDto's
   * nested class-validator rules by the time they reach here (the
   * controller's global ValidationPipe) -- this re-checks permission
   * independently, the same "two layers by design" pattern used
   * throughout the memberships module, since this method could be called
   * from somewhere that never went through the guard.
   */
  async updateSections(
    actingUserId: string,
    businessId: string,
    patch: Partial<Record<ConfigurationKey, object>>,
    correlationId: string,
  ): Promise<ConfigurationSections> {
    await this.memberships.requirePermission(actingUserId, businessId, "configuration.manage");

    const entries = (Object.entries(patch) as [ConfigurationKey, object | undefined][]).filter(
      // `patch` typically comes from an UpdateConfigurationDto instance:
      // under this project's ES2022 target, `useDefineForClassFields`
      // means every declared-but-omitted DTO property still exists as an
      // own property with value `undefined`, so Object.entries includes
      // it -- filter those out rather than upserting a null section.
      (entry): entry is [ConfigurationKey, object] => entry[1] !== undefined,
    );

    if (entries.length === 0) {
      return this.getSections(businessId);
    }

    // A single PATCH may touch several sections at once; one transaction
    // so a request that (say) fails on its second upsert never leaves
    // one section changed and another not (transaction atomicity, priority
    // #4 per AGENT.md), and so the audit record commits with the change
    // it describes rather than as a separate, possibly-missing write.
    await this.prisma.$transaction(async (tx) => {
      const touchedKeys = entries.map(([key]) => key);
      const existingRows = await tx.businessConfiguration.findMany({
        where: { businessId, key: { in: touchedKeys } },
      });
      const beforeByKey = new Map(existingRows.map((row) => [row.key, row.value]));

      for (const [key, value] of entries) {
        await tx.businessConfiguration.upsert({
          where: { businessId_key: { businessId, key } },
          create: {
            id: this.ids.generate(),
            businessId,
            key,
            value: value as Prisma.InputJsonValue,
          },
          update: { value: value as Prisma.InputJsonValue },
        });
      }

      await this.audit.record(tx, {
        businessId,
        actorUserId: actingUserId,
        action: "configuration.updated",
        targetType: "business_configuration",
        targetId: businessId,
        before: Object.fromEntries(
          touchedKeys.map((key) => [
            key,
            beforeByKey.get(key) ?? CONFIGURATION_REGISTRY[key].defaultValue,
          ]),
        ),
        after: Object.fromEntries(entries),
        correlationId,
      });
    });

    return this.getSections(businessId);
  }
}
