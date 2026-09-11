"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "../../lib/catalog/money";
import { useAuth } from "../../lib/auth/session-context";
import { useCartStore } from "../../lib/pos/cart";
import { computeCartTotal } from "../../lib/pos/totals";
import { ChargeModal } from "./charge-modal";
import { PosCart } from "./pos-cart";
import { PosDiscovery } from "./pos-discovery";

export interface PosWorkspaceProps {
  businessId: string;
}

/**
 * SPECS.md 6.1: white background, compact, "No prominent sidebar inside
 * the primary POS workspace." This renders no AppShell -- the route this
 * sits in (app/[businessId]/pos/page.tsx) is a sibling of, not nested
 * under, the (shell) route group on purpose (CODESTYLE.md "Preserve
 * visual separation between general navigation and the POS workspace").
 * Only a minimal top bar keeps the rest of the app reachable, not
 * prominent (SPECS.md 6.1: "Dashboard and other main sections remain
 * accessible from the general application navigation").
 */
export function PosWorkspace({ businessId }: PosWorkspaceProps) {
  const { user, logout } = useAuth();
  const lines = useCartStore((state) => state.lines);
  const [chargeOpen, setChargeOpen] = useState(false);
  const total = computeCartTotal(lines);

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <Link href={`/${businessId}`} className="text-sm text-gray-500 underline">
          ← Volver
        </Link>
        <span className="text-sm text-gray-600">{user?.email}</span>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sm text-gray-500 underline"
        >
          Cerrar sesión
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="flex min-h-0 flex-col border-b border-gray-200 md:border-r md:border-b-0">
          <PosCart />
          <div className="border-t border-gray-200 p-4">
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={() => setChargeOpen(true)}
              className="bg-accent text-accent-foreground w-full rounded px-4 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cobrar — {formatMoney(total)}
            </button>
          </div>
        </section>
        <section className="flex min-h-0 flex-col">
          <PosDiscovery businessId={businessId} />
        </section>
      </div>

      <ChargeModal open={chargeOpen} onClose={() => setChargeOpen(false)} />
    </div>
  );
}
