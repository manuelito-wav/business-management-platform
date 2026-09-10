"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/session-context";

interface BusinessMembership {
  businessId: string;
  businessName: string;
  roleId: string;
  roleName: string;
}

/**
 * D-024: a user may belong to more than one business, so login alone does
 * not determine where they land -- this picker is the step between
 * authenticating and entering a specific business's application shell.
 */
export default function SelectBusinessPage() {
  const router = useRouter();
  const { status, authorizedRequest, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const { data, isPending, isError } = useQuery({
    queryKey: ["my-businesses"],
    queryFn: () => authorizedRequest<BusinessMembership[]>("/businesses"),
    enabled: status === "authenticated",
  });

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-16">
      <h1 className="text-lg font-semibold text-gray-900">Elegí un negocio</h1>

      {isPending && status === "authenticated" && (
        <p className="mt-4 text-sm text-gray-500">Cargando...</p>
      )}
      {isError && <p className="mt-4 text-sm text-red-600">No se pudieron cargar tus negocios.</p>}
      {data && data.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">Todavía no pertenecés a ningún negocio.</p>
      )}

      <ul className="mt-4 space-y-2">
        {data?.map((membership) => (
          <li key={membership.businessId}>
            <button
              type="button"
              onClick={() => router.push(`/${membership.businessId}`)}
              className="w-full rounded border border-gray-200 px-4 py-3 text-left hover:border-gray-400"
            >
              <span className="block font-medium text-gray-900">{membership.businessName}</span>
              <span className="block text-sm text-gray-500">{membership.roleName}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-8 text-sm text-gray-500 underline"
      >
        Cerrar sesión
      </button>
    </main>
  );
}
