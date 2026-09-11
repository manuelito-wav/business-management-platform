"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session-context";
import type { BusinessConfiguration } from "./types";

export function useConfiguration(businessId: string) {
  const { authorizedRequest } = useAuth();
  return useQuery({
    queryKey: ["configuration", businessId],
    queryFn: () =>
      authorizedRequest<BusinessConfiguration>(`/businesses/${businessId}/configuration`),
  });
}

/**
 * Updates just the `quickProducts` section (ROADMAP.md "add configurable
 * quick products") through the same generic configuration PATCH every
 * other section already uses -- no new backend endpoint. `productIds` is
 * the complete replacement list, already in display order; the caller
 * (QuickProductsManagerDialog) sends the whole array back on every add/
 * remove/reorder rather than a partial patch, matching how the API's
 * QuickProductsConfig section is stored (one JSON value per key, not a
 * per-item collection).
 */
export function useUpdateQuickProducts(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productIds: string[]) =>
      authorizedRequest<BusinessConfiguration>(`/businesses/${businessId}/configuration`, {
        method: "PATCH",
        body: { quickProducts: { productIds } },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["configuration", businessId] }),
  });
}
