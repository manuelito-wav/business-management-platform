"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth/session-context";
import { useBusiness } from "../../lib/business/business-context";

interface NavItem {
  href: string;
  label: string;
}

/**
 * The general application chrome (SPECS.md 15.1 "Main Areas",
 * CODESTYLE.md "Preserve visual separation between general navigation and
 * the POS workspace"). Deliberately not shared with the future POS
 * workspace (ROADMAP.md Phase 4; SPECS.md 6.1 "No prominent sidebar
 * inside the primary POS workspace") -- this is why it lives under the
 * `(shell)` route group rather than the [businessId] layout every
 * business-scoped route (including the future POS route) goes through.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { businessId } = useBusiness();
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Only areas actually implemented so far (ROADMAP.md Phase 2) are
  // linked. SPECS.md 15.1 lists more ("Sales", "Inventory", "Reports"...)
  // but those modules don't exist yet -- a nav link with nothing behind it
  // would mislead, not preview.
  const navItems: NavItem[] = [
    { href: `/${businessId}`, label: "Dashboard" },
    { href: `/${businessId}/products`, label: "Productos" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded border border-gray-200 px-2 py-1 text-sm md:hidden"
            aria-expanded={navOpen}
            aria-controls="app-nav"
            onClick={() => setNavOpen((open) => !open)}
          >
            Menú
          </button>
          <span className="text-sm font-semibold text-gray-900">Business Management Platform</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user?.email}</span>
          <button type="button" onClick={() => void logout()} className="underline">
            Cerrar sesión
          </button>
        </div>
      </header>
      <div className="flex">
        <nav
          id="app-nav"
          aria-label="Navegación principal"
          className={`w-48 shrink-0 border-r border-gray-200 p-3 md:block ${navOpen ? "block" : "hidden"}`}
        >
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded px-3 py-2 text-sm ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
