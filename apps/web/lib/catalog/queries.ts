"use client";

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../auth/session-context";
import type {
  Category,
  CategoryStatus,
  CreateProductInput,
  Product,
  ProductIdentifier,
  ProductIdentifierType,
  ProductPage,
  ProductPricing,
  UpdateProductInput,
  UpsertPricingInput,
} from "./types";

export function useCategories(businessId: string) {
  const { authorizedRequest } = useAuth();
  return useQuery({
    queryKey: ["categories", businessId],
    queryFn: () => authorizedRequest<Category[]>(`/businesses/${businessId}/categories`),
  });
}

export function useCreateCategory(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      authorizedRequest<Category>(`/businesses/${businessId}/categories`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["categories", businessId] }),
  });
}

export interface UpdateCategoryInput {
  categoryId: string;
  name?: string;
  status?: CategoryStatus;
}

export function useUpdateCategory(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, ...body }: UpdateCategoryInput) =>
      authorizedRequest<Category>(`/businesses/${businessId}/categories/${categoryId}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["categories", businessId] }),
  });
}

export interface ProductsFilter {
  search?: string;
  categoryId?: string;
}

export function useProducts(businessId: string, filter: ProductsFilter, cursor: string | null) {
  const { authorizedRequest } = useAuth();
  return useQuery({
    queryKey: ["products", businessId, filter, cursor],
    queryFn: () => {
      const query = new URLSearchParams();
      if (filter.search) {
        query.set("search", filter.search);
      }
      if (filter.categoryId) {
        query.set("categoryId", filter.categoryId);
      }
      if (cursor) {
        query.set("cursor", cursor);
      }
      const queryString = query.toString();
      return authorizedRequest<ProductPage>(
        `/businesses/${businessId}/products${queryString ? `?${queryString}` : ""}`,
      );
    },
    // Keeps the current page visible while the next page loads, instead of
    // flashing to an empty/loading list on every filter or cursor change.
    placeholderData: keepPreviousData,
  });
}

/** A single product by ID (e.g. resolving a quick-product reference's display name). */
export function useProduct(businessId: string, productId: string) {
  const { authorizedRequest } = useAuth();
  return useQuery({
    queryKey: ["products", businessId, "byId", productId],
    queryFn: () => authorizedRequest<Product>(`/businesses/${businessId}/products/${productId}`),
  });
}

/**
 * Resolves several product IDs to full records in parallel (e.g. the
 * quick-products manager showing the currently-configured shortcuts by
 * name) -- there is no bulk-by-IDs endpoint on this module's HTTP surface
 * (ProductsService.findManyByIds is an internal application-service
 * method other backend modules call directly, not exposed over REST), and
 * the ordered-IDs list is expected to stay small (QUICK_PRODUCTS_MAX_ITEMS
 * on the API side), so N parallel single-product requests is the simplest
 * correct option here. Shares its cache with useProduct via the same
 * query key. A product that fails to resolve (e.g. since deleted) is
 * simply omitted, not surfaced as an error -- the same "stale reference,
 * skip it" handling as the API's own QuickProductsConfig doc comment.
 */
export function useProductsByIds(businessId: string, productIds: string[]): Product[] {
  const { authorizedRequest } = useAuth();
  const results = useQueries({
    queries: productIds.map((productId) => ({
      queryKey: ["products", businessId, "byId", productId],
      queryFn: () => authorizedRequest<Product>(`/businesses/${businessId}/products/${productId}`),
      retry: false,
    })),
  });
  return results
    .map((result) => result.data)
    .filter((product): product is Product => product !== undefined);
}

export function useCreateProduct(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      authorizedRequest<Product>(`/businesses/${businessId}/products`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products", businessId] }),
  });
}

export function useUpdateProduct(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...input }: UpdateProductInput & { productId: string }) =>
      authorizedRequest<Product>(`/businesses/${businessId}/products/${productId}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products", businessId] }),
  });
}

export function useUpsertPricing(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...input }: UpsertPricingInput & { productId: string }) =>
      authorizedRequest<ProductPricing>(`/businesses/${businessId}/products/${productId}/pricing`, {
        method: "PUT",
        body: input,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products", businessId] }),
  });
}

export function useAddProductIdentifier(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      type,
      value,
    }: {
      productId: string;
      type: ProductIdentifierType;
      value: string;
    }) =>
      authorizedRequest<ProductIdentifier>(
        `/businesses/${businessId}/products/${productId}/identifiers`,
        { method: "POST", body: { type, value } },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products", businessId] }),
  });
}

export function useRemoveProductIdentifier(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, identifierId }: { productId: string; identifierId: string }) =>
      authorizedRequest<void>(
        `/businesses/${businessId}/products/${productId}/identifiers/${identifierId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products", businessId] }),
  });
}
