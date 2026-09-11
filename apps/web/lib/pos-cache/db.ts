import Dexie, { type EntityTable } from "dexie";
import type {
  CachedCategory,
  CachedPosConfiguration,
  CachedPosDraft,
  CachedProduct,
} from "./types";

export interface RefreshMetaRecord {
  businessId: string;
  refreshedAt: Date;
}

/**
 * The "early Dexie schema" (ROADMAP.md "add local POS reference cache"),
 * now also holding `posDrafts` (ROADMAP.md "add multi-tab POS drafts").
 * `products`/`categories`/`posConfiguration` stay versioned, read-only
 * reference snapshots, replaced wholesale by refreshPosCache (see
 * refresh.ts) during normal online use; `posDrafts` is the one table
 * here that is NOT server-derived -- it is a lightweight, best-effort
 * local snapshot of a business's in-progress sale tabs (see
 * CachedPosDraft's own doc comment for why this is not the same as a
 * durable outbox). A later Phase 6 checkpoint ("add local operational
 * data store") still extends this further with active business/register
 * context, a durable outbox, a sync cursor, and recovery-artifact
 * metadata for FINALIZED operations -- none of that belongs here yet;
 * there is no offline finalization, outbox, retry, or sync conflict
 * handling in this checkpoint (ARCHITECTURE.md "Offline"/D-021 govern
 * that later work).
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
  posDrafts!: EntityTable<CachedPosDraft, "businessId">;

  constructor(name = "bmp-pos-cache") {
    super(name);
    this.version(1).stores({
      products: "id, businessId, categoryId, name",
      categories: "id, businessId, name",
      posConfiguration: "businessId",
      refreshMeta: "businessId",
    });
    // v2 (ROADMAP.md "add multi-tab POS drafts"): adds posDrafts only --
    // every v1 table/index above is carried forward unchanged; a pure
    // addition needs no .upgrade() callback since there is no existing
    // data to transform.
    this.version(2).stores({
      posDrafts: "businessId",
    });
  }
}

/** The app's one real cache instance. Tests construct their own named `PosCacheDatabase` instead of sharing this singleton. */
export const posCacheDatabase = new PosCacheDatabase();
