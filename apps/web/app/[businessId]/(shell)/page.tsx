"use client";

import Link from "next/link";
import { useAuth } from "../../../lib/auth/session-context";
import { useBusiness } from "../../../lib/business/business-context";

/**
 * The "dashboard entry" ROADMAP.md checkpoint asks for -- the landing
 * screen after login/business selection (SPECS.md 15.3 "After login,
 * users should generally land on the dashboard"). This is not yet the
 * full operational Dashboard (current-day sales, alerts, register status)
 * -- that is its own later ROADMAP.md Phase 5 checkpoint ("add operational
 * dashboard"), which needs sales/inventory/cash facts that don't exist yet.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { businessId, hasPermission } = useBusiness();

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-600">Bienvenido/a, {user?.email}.</p>
      <p className="mt-1 text-sm text-gray-500">
        El resumen operativo (ventas del día, alertas, estado de caja) se agrega en una fase
        posterior del roadmap.
      </p>

      <section className="mt-6 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900">Accesos rápidos</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link href={`/${businessId}/products`} className="text-accent underline">
              Ver catálogo de productos
            </Link>
          </li>
          {hasPermission("catalog.manage") && (
            <li>
              <Link href={`/${businessId}/products?new=1`} className="text-accent underline">
                Cargar un producto nuevo
              </Link>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
