"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session-context";

export interface BusinessSelection {
  businessId: string;
  roleId: string;
  permissions: string[];
}

export type BusinessStatus = "loading" | "ready" | "error";

interface BusinessContextValue {
  businessId: string;
  status: BusinessStatus;
  roleId: string | null;
  permissions: string[];
  /** Whether the caller's active role grants this permission code (D-038 `<module>.<action>`). */
  hasPermission: (code: string) => boolean;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export interface BusinessProviderProps {
  businessId: string;
  children: ReactNode;
}

/**
 * Resolves the caller's membership for one business (businesses.controller.ts
 * `POST :businessId/select`) and exposes its permission set for
 * nav/action gating -- BusinessAuthorizationGuard re-validates membership on
 * every underlying API call regardless (ARCHITECTURE.md: "Never trust
 * frontend authorization"), so this context is a UX convenience, not a
 * security boundary.
 */
export function BusinessProvider({ businessId, children }: BusinessProviderProps) {
  const { authorizedRequest } = useAuth();

  const query = useQuery({
    queryKey: ["business-selection", businessId],
    queryFn: () =>
      authorizedRequest<BusinessSelection>(`/businesses/${businessId}/select`, {
        method: "POST",
      }),
    staleTime: Infinity,
  });

  const status: BusinessStatus = query.isPending ? "loading" : query.isError ? "error" : "ready";
  const permissions = query.data?.permissions ?? [];

  const value: BusinessContextValue = {
    businessId,
    status,
    roleId: query.data?.roleId ?? null,
    permissions,
    hasPermission: (code) => permissions.includes(code),
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used within a BusinessProvider.");
  }
  return context;
}
