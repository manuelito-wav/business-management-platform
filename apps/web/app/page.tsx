"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth/session-context";

/**
 * The app has no public marketing content -- this route only decides where
 * an incoming visitor belongs (SPECS.md 15.2 "Login -> Select Register ->
 * Sell..." starts from an authenticated context) and redirects there.
 */
export default function HomePage() {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated") {
      router.replace(user?.activeBusinessId ? `/${user.activeBusinessId}` : "/select-business");
    }
  }, [status, user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Cargando...</p>
    </main>
  );
}
