import { posCacheDatabase, type PosCacheDatabase } from "./db";
import type {
  CachedCategory,
  CachedPosConfiguration,
  CachedProduct,
  RemoteCategory,
  RemoteConfiguration,
  RemoteProductPage,
} from "./types";

const PRODUCT_PAGE_LIMIT = 100;

export interface RefreshPosCacheOptions {
  /** Origin only, no trailing slash (e.g. NEXT_PUBLIC_API_URL). */
  apiBaseUrl: string;
  accessToken: string;
  businessId: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to the shared posCacheDatabase singleton. */
  database?: PosCacheDatabase;
}

export interface RefreshPosCacheResult {
  productCount: number;
  categoryCount: number;
  refreshedAt: Date;
}

/**
 * Replaces one business's cached products/categories/configuration
 * wholesale with a fresh pull from the API -- "refreshed during normal
 * online use" (ROADMAP.md), not an incremental sync (that needs the
 * cursor/version semantics ROADMAP.md's Phase 6 "add scoped POS data
 * synchronization" checkpoint builds). If any fetch fails, nothing is
 * written: the whole write happens in one Dexie transaction after every
 * fetch has already succeeded, so a partial failure never leaves a
 * half-refreshed cache.
 */
export async function refreshPosCache(
  options: RefreshPosCacheOptions,
): Promise<RefreshPosCacheResult> {
  const { apiBaseUrl, accessToken, businessId } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const db = options.database ?? posCacheDatabase;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const [categories, products, remoteConfiguration] = await Promise.all([
    fetchCategories(apiBaseUrl, businessId, headers, fetchImpl),
    fetchAllProducts(apiBaseUrl, businessId, headers, fetchImpl),
    fetchConfiguration(apiBaseUrl, businessId, headers, fetchImpl),
  ]);
  const configuration: CachedPosConfiguration = { businessId, ...remoteConfiguration };
  const refreshedAt = new Date();

  // One transaction, scoped to this businessId only: a refresh for
  // business A never touches business B's already-cached rows (D-024).
  await db.transaction(
    "rw",
    [db.products, db.categories, db.posConfiguration, db.refreshMeta],
    async () => {
      await db.products.where("businessId").equals(businessId).delete();
      await db.categories.where("businessId").equals(businessId).delete();
      if (products.length > 0) {
        await db.products.bulkAdd(products);
      }
      if (categories.length > 0) {
        await db.categories.bulkAdd(categories);
      }
      await db.posConfiguration.put(configuration);
      await db.refreshMeta.put({ businessId, refreshedAt });
    },
  );

  return { productCount: products.length, categoryCount: categories.length, refreshedAt };
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`POS cache refresh request to ${url} failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function fetchCategories(
  apiBaseUrl: string,
  businessId: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<CachedCategory[]> {
  const remote = await fetchJson<RemoteCategory[]>(
    `${apiBaseUrl}/businesses/${businessId}/categories`,
    headers,
    fetchImpl,
  );
  return remote.map((category) => ({
    id: category.id,
    businessId: category.businessId,
    name: category.name,
    status: category.status,
  }));
}

async function fetchAllProducts(
  apiBaseUrl: string,
  businessId: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<CachedProduct[]> {
  const products: CachedProduct[] = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ limit: String(PRODUCT_PAGE_LIMIT) });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const page = await fetchJson<RemoteProductPage>(
      `${apiBaseUrl}/businesses/${businessId}/products?${query.toString()}`,
      headers,
      fetchImpl,
    );
    for (const product of page.data) {
      products.push({
        id: product.id,
        businessId: product.businessId,
        categoryId: product.categoryId,
        name: product.name,
        saleMode: product.saleMode,
        weightUnit: product.weightUnit,
        imageUrl: product.imageUrl,
        status: product.status,
        salePrice: product.pricing?.salePrice ?? null,
        identifiers: product.identifiers.map((identifier) => ({
          type: identifier.type,
          normalizedValue: identifier.normalizedValue,
        })),
      });
    }
    cursor = page.pagination.nextCursor;
  } while (cursor !== null);

  return products;
}

async function fetchConfiguration(
  apiBaseUrl: string,
  businessId: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<RemoteConfiguration> {
  return fetchJson<RemoteConfiguration>(
    `${apiBaseUrl}/businesses/${businessId}/configuration`,
    headers,
    fetchImpl,
  );
}
