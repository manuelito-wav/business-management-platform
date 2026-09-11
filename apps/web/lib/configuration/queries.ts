"use client";

import { useQuery } from "@tanstack/react-query";
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
