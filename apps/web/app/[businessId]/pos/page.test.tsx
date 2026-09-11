import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../lib/auth/session-context";
import { BusinessProvider } from "../../../lib/business/business-context";
import { posCacheDatabase } from "../../../lib/pos-cache/db";
import PosPage from "./page";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPosPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <BusinessProvider businessId="biz-1">
          <PosPage />
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function baseHandlers(input: RequestInfo | URL): Response | undefined {
  const url = String(input);
  if (url.endsWith("/auth/refresh")) {
    return jsonResponse({ accessToken: "token-1", accessTokenExpiresAt: new Date().toISOString() });
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
    return jsonResponse({ businessId: "biz-1", roleId: "role-1", permissions: ["sales.create"] });
  }
  return undefined;
}

afterEach(async () => {
  await posCacheDatabase.products.where("businessId").equals("biz-1").delete();
  await posCacheDatabase.categories.where("businessId").equals("biz-1").delete();
});

describe("PosPage", () => {
  it("shows the register selector when the caller has no open session", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const base = baseHandlers(input);
      if (base) {
        return base;
      }
      const url = String(input);
      if (url.endsWith("/businesses/biz-1/register-sessions/mine")) {
        return jsonResponse(null);
      }
      if (url.endsWith("/businesses/biz-1/registers")) {
        return jsonResponse([
          { id: "reg-1", businessId: "biz-1", name: "Caja 1", status: "active" },
        ]);
      }
      if (url.endsWith("/businesses/biz-1/configuration")) {
        return jsonResponse({
          businessTimezone: "America/Argentina/Buenos_Aires",
          registerPolicy: { requireOpeningAmount: false },
        });
      }
      if (
        url.includes("/businesses/biz-1/categories") ||
        url.includes("/businesses/biz-1/products")
      ) {
        return jsonResponse(
          url.includes("/products") ? { data: [], pagination: { nextCursor: null } } : [],
        );
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;

    renderPosPage(fetchImpl);

    expect(await screen.findByText("Elegí una caja")).toBeInTheDocument();
    expect(await screen.findByText("Caja 1")).toBeInTheDocument();
  });

  it("shows the POS workspace, lets a search add a product to the cart, and updates the total", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const base = baseHandlers(input);
      if (base) {
        return base;
      }
      const url = String(input);
      if (url.endsWith("/businesses/biz-1/register-sessions/mine")) {
        return jsonResponse({
          id: "sess-1",
          businessId: "biz-1",
          registerId: "reg-1",
          userId: "user-1",
          status: "open",
          openingAmount: null,
          openedAt: new Date().toISOString(),
          closedAt: null,
        });
      }
      if (url.endsWith("/businesses/biz-1/categories")) {
        return jsonResponse([
          { id: "cat-1", businessId: "biz-1", name: "Beverages", status: "active" },
        ]);
      }
      if (url.includes("/businesses/biz-1/products")) {
        return jsonResponse({
          data: [
            {
              id: "prod-1",
              businessId: "biz-1",
              categoryId: "cat-1",
              name: "Cola",
              saleMode: "unit",
              weightUnit: null,
              imageUrl: null,
              status: "active",
              identifiers: [{ type: "barcode", normalizedValue: "111" }],
              pricing: { salePrice: 10000 },
            },
          ],
          pagination: { nextCursor: null },
        });
      }
      if (url.endsWith("/businesses/biz-1/configuration")) {
        return jsonResponse({
          businessTimezone: "America/Argentina/Buenos_Aires",
          paymentMethods: {},
          featureFlags: {},
          policies: {},
          registerPolicy: { requireOpeningAmount: false },
        });
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;

    renderPosPage(fetchImpl);

    const searchInput = await screen.findByLabelText("Buscar productos");
    const user = userEvent.setup();
    await user.type(searchInput, "cola");

    const tile = await screen.findByRole("button", { name: /Cola/ });
    await user.click(tile);

    const chargeButton = await screen.findByRole("button", { name: /Cobrar/ });
    await waitFor(() => expect(chargeButton).toHaveTextContent(/100,00/));

    await user.click(chargeButton);
    expect(await screen.findByText("1 producto")).toBeInTheDocument();
  });
});
