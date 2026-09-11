import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { PosCacheDatabase } from "./db";

describe("PosCacheDatabase", () => {
  it("defines the reference-cache tables plus posDrafts at version 2", async () => {
    const db = new PosCacheDatabase("pos-cache-schema-test");
    await db.open();

    expect(db.verno).toBe(2);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      "categories",
      "posConfiguration",
      "posDrafts",
      "products",
      "refreshMeta",
    ]);

    db.close();
    await db.delete();
  });

  it("indexes products and categories by businessId, for scoped refreshes/reads", async () => {
    const db = new PosCacheDatabase("pos-cache-index-test");
    await db.open();

    expect(db.products.schema.indexes.map((index) => index.name)).toContain("businessId");
    expect(db.categories.schema.indexes.map((index) => index.name)).toContain("businessId");

    db.close();
    await db.delete();
  });
});

describe("Dexie schema migration (validating the upgrade mechanism itself)", () => {
  const dbName = "pos-cache-migration-pattern-test";

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it("upgrades an existing database to a new schema version without losing data", async () => {
    // A prior version, as if it were an already-installed client's cache.
    const v1 = new Dexie(dbName);
    v1.version(1).stores({ widgets: "id, name" });
    await v1.open();
    await v1.table("widgets").add({ id: "1", name: "Widget" });
    v1.close();

    // A later version that adds an indexed field via an upgrade step --
    // the same pattern a real future PosCacheDatabase version bump
    // (e.g. Phase 6's "add local operational data store") would use.
    const v2 = new Dexie(dbName);
    v2.version(1).stores({ widgets: "id, name" });
    v2.version(2)
      .stores({ widgets: "id, name, status" })
      .upgrade(async (tx) => {
        await tx.table("widgets").toCollection().modify({ status: "active" });
      });
    await v2.open();

    const widget = await v2.table("widgets").get("1");
    expect(widget).toMatchObject({ id: "1", name: "Widget", status: "active" });
    expect(v2.verno).toBe(2);

    v2.close();
  });
});
