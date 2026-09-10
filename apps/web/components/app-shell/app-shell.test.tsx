import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session-context";
import { BusinessProvider } from "../../lib/business/business-context";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/biz-1",
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderShell(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <BusinessProvider businessId="biz-1">
          <AppShell>
            <p>contenido de la pantalla</p>
          </AppShell>
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function baseFetchImpl(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      return jsonResponse({
        accessToken: "token-1",
        accessTokenExpiresAt: new Date().toISOString(),
      });
    }
    if (url.endsWith("/auth/me")) {
      return jsonResponse({
        id: "user-1",
        email: "owner@kiosk.test",
        username: null,
        activeBusinessId: "biz-1",
      });
    }
    if (url.endsWith("/businesses/biz-1/select")) {
      return jsonResponse({
        businessId: "biz-1",
        roleId: "role-1",
        permissions: ["catalog.manage"],
      });
    }
    if (url.endsWith("/auth/logout")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unhandled: ${url}`);
  }) as unknown as typeof fetch;
}

describe("AppShell", () => {
  it("links only to implemented general-navigation areas, and never to the POS workspace", async () => {
    renderShell(baseFetchImpl());

    expect(await screen.findByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/biz-1",
    );
    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute(
      "href",
      "/biz-1/products",
    );
    // CODESTYLE.md "Preserve visual separation between general navigation
    // and the POS workspace" -- the POS route doesn't exist yet
    // (ROADMAP.md Phase 4) and must never appear as a nav link here.
    expect(screen.queryByText(/pos/i)).not.toBeInTheDocument();
  });

  it("renders the signed-in user's email and logs out on request", async () => {
    renderShell(baseFetchImpl());
    expect(await screen.findByText("owner@kiosk.test")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(screen.queryByText("owner@kiosk.test")).not.toBeInTheDocument());
  });

  it("renders the page content passed as children", async () => {
    renderShell(baseFetchImpl());
    expect(await screen.findByText("contenido de la pantalla")).toBeInTheDocument();
  });
});
