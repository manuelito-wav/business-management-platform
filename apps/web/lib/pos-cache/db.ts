import Dexie, { type EntityTable } from "dexie";
import type { CachedCategory, CachedPosConfiguration, CachedProduct } from "./types";

export interface RefreshMetaRecord {
  businessId: string;
  refreshedAt: Date;
}

/**
 * The "early Dexie schema" (ROADMAP.md "add local POS reference cache").
 * A later Phase 6 checkpoint ("add local operational data store")
 * extends this with active business/register context, local drafts, a
 * durable outbox, a sync cursor, and recovery-artifact metadata -- none
 * of that belongs here yet. This version only holds versioned,
 * read-only reference snapshots (products, categories, POS
 * configuration), replaced wholesale by refreshPosCache (see refresh.ts)
 * during normal online use. There is no offline finalization, outbox,
 * retry, or sync conflict handling in this checkpoint (ARCHITECTURE.md
 * "Offline"/D-021 govern that later work).
 *
 * Every table is scoped by `businessId` (D-024: a user may belong to
 * multiple businesses) and indexed on it, so a refresh for one business
 * only ever touches that business's own rows -- see refresh.ts's own
 * "scoped" transaction.
 */
export class PosCacheDatabase extends Dexie {
  products!: EntityTable<CachedProduct, "id">;
  categories!: EntityTable<CachedCategory, "id">;
  posConfiguration!: EntityTable<CachedPosConfiguration, "businessId">;
  refreshMeta!: EntityTable<RefreshMetaRecord, "businessId">;

  constructor(name = "bmp-pos-cache") {
    super(name);
    this.version(1).stores({
      products: "id, businessId, categoryId, name",
      categories: "id, businessId, name",
      posConfiguration: "businessId",
      refreshMeta: "businessId",
    });
  }
}

/** The app's one real cache instance. Tests construct their own named `PosCacheDatabase` instead of sharing this singleton. */
export const posCacheDatabase = new PosCacheDatabase();
