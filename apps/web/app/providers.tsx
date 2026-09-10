"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth/session-context";

export function Providers({ children }: { children: ReactNode }) {
  // Created once per browser session (useState initializer), not per
  // render -- the standard TanStack Query app-router pattern.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
