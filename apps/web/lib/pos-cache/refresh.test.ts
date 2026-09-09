import { afterEach, describe, expect, it } from "vitest";
import { PosCacheDatabase } from "./db";
import { refreshPosCache } from "./refresh";
import type { RemoteCategory, RemoteConfiguration, RemoteProductPage } from "./types";

const API_BASE_URL = "https://api.test";
const BUSINESS_A = "business-a";
const BUSINESS_B = "business-b";

const CATEGORY: RemoteCategory = {
  id: "cat-1",
  businessId: BUSINESS_A,
  name: "Beverages",
  status: "active",
};

const CONFIGURATION: RemoteConfiguration = {
  businessTimezone: "America/Argentina/Buenos_Aires",
  paymentMethods: { cash: true },
  featureFlags: { priceLists: false },
  policies: { negativeProfitabilityHandling: "restricted_by_permission" },
  registerPolicy: { requireOpeningAmount: false },
};

function productPage(
  data: RemoteProductPage["data"],
  nextCursor: string | null = null,
): RemoteProductPage {
  return { data, pagination: { nextCursor } };
}

/** Dispatches by pathname (+ cursor query param for the products page) rather than exact URL matching, since query strings otherwise vary. */
function createFakeFetch(handlers: {
  categories?: () => Response | Promise<Response>;
  products?: (cursor: string | null) => Response | Promise<Response>;
  configuration?: () => Response | Promise<Response>;
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/categories") && handlers.categories) {
      return handlers.categories();
    }
    if (url.pathname.endsWith("/products") && handlers.products) {
      return handlers.products(url.searchParams.get("cursor"));
    }
    if (url.pathname.endsWith("/configuration") && handlers.configuration) {
      return handlers.configuration();
    }
    throw new Error(`Unhandled fake fetch request: ${url.toString()}`);
  }) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refreshPosCache", () => {
  let db: PosCacheDatabase;

  afterEach(async () => {
    db?.close();
    await db?.delete();
  });

  it("caches categories, all pages of products (with salePrice extracted), and configuration, scoped to one business", async () => {
    db = new PosCacheDatabase("refresh-test-1");
    const fetchImpl = createFakeFetch({
      categories: () => json([CATEGORY]),
      products: (cursor) =>
        cursor === null
          ? json(
              productPage(
                [
                  {
                    id: "prod-1",
                    businessId: BUSINESS_A,
                    categoryId: CATEGORY.id,
                    name: "Cola",
                    saleMode: "unit",
                    weightUnit: null,
                    imageUrl: null,
                    status: "active",
                    identifiers: [{ type: "barcode", normalizedValue: "111" }],
                    pricing: { salePrice: 10000 },
                  },
                ],
                "cursor-1",
              ),
            )
          : json(
              productPage([
                {
                  id: "prod-2",
                  businessId: BUSINESS_A,
                  categoryId: CATEGORY.id,
                  name: "Bananas",
                  saleMode: "weighted",
                  weightUnit: "kg",
                  imageUrl: null,
                  status: "active",
                  identifiers: [],
                  // Never priced yet -- must cache as null, not crash.
                  pricing: null,
                },
              ]),
            ),
      configuration: () => json(CONFIGURATION),
    });

    const result = await refreshPosCache({
      apiBaseUrl: API_BASE_URL,
      accessToken: "test-token",
      businessId: BUSINESS_A,
      fetchImpl,
      database: db,
    });

    expect(result).toMatchObject({ productCount: 2, categoryCount: 1 });
    expect(result.refreshedAt).toBeInstanceOf(Date);

    const products = await db.products.orderBy("name").toArray();
    expect(products.map((product) => product.name)).toEqual(["Bananas", "Cola"]);
    expect(products.find((product) => product.id === "prod-1")?.salePrice).toBe(10000);
    expect(products.find((product) => product.id === "prod-2")?.salePrice).toBeNull();
    expect(products.find((product) => product.id === "prod-1")?.identifiers).toEqual([
      { type: "barcode", normalizedValue: "111" },
    ]);

    const categories = await db.categories.toArray();
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ id: "cat-1", name: "Beverages" });

    const configuration = await db.posConfiguration.get(BUSINESS_A);
    expect(configuration).toMatchObject({ businessId: BUSINESS_A, ...CONFIGURATION });

    const meta = await db.refreshMeta.get(BUSINESS_A);
    expect(meta?.refreshedAt).toBeInstanceOf(Date);
  });

  it("replaces a business's previous snapshot without touching another business's cache", async () => {
    db = new PosCacheDatabase("refresh-test-2");
    await db.products.bulkAdd([
      {
        id: "stale-a",
        businessId: BUSINESS_A,
        categoryId: CATEGORY.id,
        name: "Stale product",
        saleMode: "unit",
        weightUnit: null,
        imageUrl: null,
        status: "active",
        salePrice: 500,
        identifiers: [],
      },
      {
        id: "other-business-product",
        businessId: BUSINESS_B,
        categoryId: "other-category",
        name: "Business B product",
        saleMode: "unit",
        weightUnit: null,
        imageUrl: null,
        status: "active",
        salePrice: 999,
        identifiers: [],
      },
    ]);

    const fetchImpl = createFakeFetch({
      categories: () => json([]),
      products: () =>
        json(
          productPage([
            {
              id: "fresh-a",
              businessId: BUSINESS_A,
              categoryId: CATEGORY.id,
              name: "Fresh product",
              saleMode: "unit",
              weightUnit: null,
              imageUrl: null,
              status: "active",
              identifiers: [],
              pricing: { salePrice: 1200 },
            },
          ]),
        ),
      configuration: () => json(CONFIGURATION),
    });

    await refreshPosCache({
      apiBaseUrl: API_BASE_URL,
      accessToken: "test-token",
      businessId: BUSINESS_A,
      fetchImpl,
      database: db,
    });

    const businessAProducts = await db.products.where("businessId").equals(BUSINESS_A).toArray();
    expect(businessAProducts.map((product) => product.id)).toEqual(["fresh-a"]);

    const businessBProducts = await db.products.where("businessId").equals(BUSINESS_B).toArray();
    expect(businessBProducts.map((product) => product.id)).toEqual(["other-business-product"]);
  });

  it("writes nothing when a fetch fails partway through", async () => {
    db = new PosCacheDatabase("refresh-test-3");
    const fetchImpl = createFakeFetch({
      categories: () => json({ error: { code: "INTERNAL_ERROR" } }, 500),
      products: () => json(productPage([])),
      configuration: () => json(CONFIGURATION),
    });

    await expect(
      refreshPosCache({
        apiBaseUrl: API_BASE_URL,
        accessToken: "test-token",
        businessId: BUSINESS_A,
        fetchImpl,
        database: db,
      }),
    ).rejects.toThrow(/status 500/);

    await expect(db.products.count()).resolves.toBe(0);
    await expect(db.refreshMeta.count()).resolves.toBe(0);
  });
});
