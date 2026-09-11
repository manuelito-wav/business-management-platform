"use client";

import { PosWorkspace } from "../../../components/pos/pos-workspace";
import { RegisterSelector } from "../../../components/pos/register-selector";
import { useBusiness } from "../../../lib/business/business-context";
import { useRefreshPosCache } from "../../../lib/pos-cache/use-refresh-pos-cache";
import { usePosDraft } from "../../../lib/pos/use-pos-draft";
import { useMyRegisterSession } from "../../../lib/registers/queries";

/**
 * Deliberately NOT under app/[businessId]/(shell)/ -- see PosWorkspace's
 * own doc comment for why the POS route must not inherit the general
 * navigation shell (SPECS.md 6.1, CODESTYLE.md).
 */
export default function PosPage() {
  const { businessId } = useBusiness();
  const { data: session, isPending, isError } = useMyRegisterSession(businessId);
  // Always mounted (not conditional on `session`) so the cache is already
  // warm by the time a session exists, instead of waiting for it first.
  const cacheStatus = useRefreshPosCache(businessId);
  // Same reasoning: recover/reset this business's draft tabs before the
  // workspace renders, so a leftover cart from a different business (the
  // cart store is a businessId-aware module singleton -- see cart.ts)
  // never flashes on screen even for a moment.
  const draftStatus = usePosDraft(businessId);

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Cargando...</p>
      </main>
    );
  }
  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-600">No se pudo verificar la sesión de caja.</p>
      </main>
    );
  }
  if (!session) {
    return <RegisterSelector businessId={businessId} />;
  }
  if (cacheStatus.status === "refreshing") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Preparando el catálogo...</p>
      </main>
    );
  }
  if (cacheStatus.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-600">No se pudo cargar el catálogo local.</p>
      </main>
    );
  }
  if (draftStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Preparando el catálogo...</p>
      </main>
    );
  }

  return <PosWorkspace businessId={businessId} />;
}
