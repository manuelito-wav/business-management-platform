"use client";

import { useEffect, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/session-context";
import { BusinessProvider } from "../../lib/business/business-context";

/**
 * Every business-scoped route -- including the future POS workspace
 * (ROADMAP.md Phase 4) -- goes through this layout, so it only resolves
 * auth/business context; it deliberately renders no navigation chrome of
 * its own (see components/app-shell/app-shell.tsx, used one level down by
 * the (shell) route group, for that -- CODESTYLE.md "Preserve visual
 * separation between general navigation and the POS workspace").
 */
export default function BusinessLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useParams<{ businessId: string }>();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Cargando...</p>
      </main>
    );
  }

  return <BusinessProvider businessId={params.businessId}>{children}</BusinessProvider>;
}
