import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/session-context";
import { BusinessProvider, useBusiness } from "./business-context";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function BusinessProbe() {
  const business = useBusiness();
  return (
    <div>
      <span data-testid="status">{business.status}</span>
      <span data-testid="can-manage-catalog">
        {String(business.hasPermission("catalog.manage"))}
      </span>
      <span data-testid="can-manage-pricing">
        {String(business.hasPermission("pricing.manage"))}
      </span>
    </div>
  );
}

function renderProbe(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <BusinessProvider businessId="biz-1">
          <BusinessProbe />
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("BusinessProvider", () => {
  it("selects the business and derives hasPermission from the returned permission codes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
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
          email: "employee@kiosk.test",
          username: null,
          activeBusinessId: "biz-1",
        });
      }
      if (url.endsWith("/businesses/biz-1/select")) {
        return jsonResponse({
          businessId: "biz-1",
          roleId: "role-1",
          permissions: ["sales.create"],
        });
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;

    renderProbe(fetchImpl);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("can-manage-catalog")).toHaveTextContent("false");
    expect(screen.getByTestId("can-manage-pricing")).toHaveTextContent("false");
  });

  it("grants permissions the select response includes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
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
          roleId: "role-owner",
          permissions: ["catalog.manage", "pricing.manage"],
        });
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;

    renderProbe(fetchImpl);

    await waitFor(() => expect(screen.getByTestId("can-manage-catalog")).toHaveTextContent("true"));
    expect(screen.getByTestId("can-manage-pricing")).toHaveTextContent("true");
  });
});
