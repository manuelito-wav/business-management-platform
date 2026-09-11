"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session-context";
import type { Register, RegisterSession } from "./types";

export function useRegisters(businessId: string) {
  const { authorizedRequest } = useAuth();
  return useQuery({
    queryKey: ["registers", businessId],
    queryFn: () => authorizedRequest<Register[]>(`/businesses/${businessId}/registers`),
  });
}

/** null means the caller has no open session right now (SPECS.md 15.2 "Select Register" step not done yet). */
export function useMyRegisterSession(businessId: string) {
  const { authorizedRequest } = useAuth();
  return useQuery({
    queryKey: ["my-register-session", businessId],
    queryFn: () =>
      authorizedRequest<RegisterSession | null>(`/businesses/${businessId}/register-sessions/mine`),
  });
}

export function useOpenRegisterSession(businessId: string) {
  const { authorizedRequest } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registerId, openingAmount }: { registerId: string; openingAmount?: number }) =>
      authorizedRequest<RegisterSession>(
        `/businesses/${businessId}/registers/${registerId}/sessions`,
        {
          method: "POST",
          body: { openingAmount },
        },
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["my-register-session", businessId] }),
  });
}
