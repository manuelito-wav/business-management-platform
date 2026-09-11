import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../lib/auth/session-context";
import { BusinessProvider } from "../../../lib/business/business-context";
import { posCacheDatabase } from "../../../lib/pos-cache/db";
import { useCartStore } from "../../../lib/pos/cart";
import PosPage from "./page";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPosPage(fetchImpl: typeof fetch, businessId = "biz-1") {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <BusinessProvider businessId={businessId}>
          <PosPage />
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function baseHandlers(input: RequestInfo | URL, businessId = "biz-1"): Response | undefined {
  const url = String(input);
  if (url.endsWith("/auth/refresh")) {
    return jsonResponse({ accessToken: "token-1", accessTokenExpiresAt: new Date().toISOString() });
  }
  if (url.endsWith("/auth/me")) {
    return jsonResponse({
      id: "user-1",
      email: "owner@kiosk.test",
      username: null,
      activeBusinessId: businessId,
    });
  }
  if (url.endsWith(`/businesses/${businessId}/select`)) {
    return jsonResponse({ businessId, roleId: "role-1", permissions: ["sales.create"] });
  }
  return undefined;
}

// Each test below scopes its own businessId's cached rows -- distinct IDs
// per test (rather than every test sharing "biz-1") avoid a real race:
// refreshPosCache's Dexie write is not tied to the component's lifecycle
// (see use-refresh-pos-cache.ts), so one test's in-flight refresh can
// still land after the next test has already started and overwrite its
// freshly-written cache for the same businessId key.
const TEST_BUSINESS_IDS = ["biz-1", "biz-quick", "biz-tabs"];

// The cart store is a module-level Zustand singleton (see lib/pos/cart.ts's
// own doc comment) -- reset it to a business none of these tests use, so
// each test's own usePosDraft hydration starts genuinely from "loading"
// instead of reading a previous test's leftover businessId/tabs (same
// reasoning as use-pos-draft.test.ts's own beforeEach).
beforeEach(() => {
  useCartStore.getState().resetForBusiness("__unused_reset_business__");
});

afterEach(async () => {
  for (const businessId of TEST_BUSINESS_IDS) {
    await posCacheDatabase.products.where("businessId").equals(businessId).delete();
    await posCacheDatabase.categories.where("businessId").equals(businessId).delete();
    await posCacheDatabase.posDrafts.delete(businessId);
  }
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

  it("shows a Rápidos shortcut pill for configured quick products and filters the grid with it", async () => {
    const businessId = "biz-quick";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const base = baseHandlers(input, businessId);
      if (base) {
        return base;
      }
      const url = String(input);
      if (url.endsWith(`/businesses/${businessId}/register-sessions/mine`)) {
        return jsonResponse({
          id: "sess-1",
          businessId,
          registerId: "reg-1",
          userId: "user-1",
          status: "open",
          openingAmount: null,
          openedAt: new Date().toISOString(),
          closedAt: null,
        });
      }
      if (url.endsWith(`/businesses/${businessId}/categories`)) {
        return jsonResponse([{ id: "cat-1", businessId, name: "Beverages", status: "active" }]);
      }
      if (url.includes(`/businesses/${businessId}/products`)) {
        return jsonResponse({
          data: [
            {
              id: "prod-1",
              businessId,
              categoryId: "cat-1",
              name: "Cola",
              saleMode: "unit",
              weightUnit: null,
              imageUrl: null,
              status: "active",
              identifiers: [],
              pricing: { salePrice: 10000 },
            },
            {
              id: "prod-2",
              businessId,
              categoryId: "cat-1",
              name: "Sprite",
              saleMode: "unit",
              weightUnit: null,
              imageUrl: null,
              status: "active",
              identifiers: [],
              pricing: { salePrice: 9000 },
            },
          ],
          pagination: { nextCursor: null },
        });
      }
      if (url.endsWith(`/businesses/${businessId}/configuration`)) {
        return jsonResponse({
          businessTimezone: "America/Argentina/Buenos_Aires",
          paymentMethods: {},
          featureFlags: {},
          policies: {},
          registerPolicy: { requireOpeningAmount: false },
          quickProducts: { productIds: ["prod-1"] },
        });
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;

    renderPosPage(fetchImpl, businessId);

    await screen.findByRole("button", { name: /Cola/ });
    expect(screen.getByRole("button", { name: /Sprite/ })).toBeInTheDocument();

    // The "Rápidos" pill only renders once useQuickProducts's own Dexie
    // live query resolves, a separate async read from the one that
    // populates the general catalog grid above -- wait for it explicitly
    // rather than assuming both queries settle in the same tick.
    const quickPill = await screen.findByRole("button", { name: "Rápidos" });
    const user = userEvent.setup();
    await user.click(quickPill);

    expect(await screen.findByRole("button", { name: /Cola/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sprite/ })).not.toBeInTheDocument();
  });

  it("keeps multiple sale tabs independent and recovers them as a draft after a reload", async () => {
    const businessId = "biz-tabs";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const base = baseHandlers(input, businessId);
      if (base) {
        return base;
      }
      const url = String(input);
      if (url.endsWith(`/businesses/${businessId}/register-sessions/mine`)) {
        return jsonResponse({
          id: "sess-1",
          businessId,
          registerId: "reg-1",
          userId: "user-1",
          status: "open",
          openingAmount: null,
          openedAt: new Date().toISOString(),
          closedAt: null,
        });
      }
      if (url.endsWith(`/businesses/${businessId}/categories`)) {
        return jsonResponse([{ id: "cat-1", businessId, name: "Beverages", status: "active" }]);
      }
      if (url.includes(`/businesses/${businessId}/products`)) {
        return jsonResponse({
          data: [
            {
              id: "prod-1",
              businessId,
              categoryId: "cat-1",
              name: "Cola",
              saleMode: "unit",
              weightUnit: null,
              imageUrl: null,
              status: "active",
              identifiers: [],
              pricing: { salePrice: 10000 },
            },
            {
              id: "prod-2",
              businessId,
              categoryId: "cat-1",
              name: "Sprite",
              saleMode: "unit",
              weightUnit: null,
              imageUrl: null,
              status: "active",
              identifiers: [],
              pricing: { salePrice: 9000 },
            },
          ],
          pagination: { nextCursor: null },
        });
      }
      if (url.endsWith(`/businesses/${businessId}/configuration`)) {
        return jsonResponse({
          businessTimezone: "America/Argentina/Buenos_Aires",
          paymentMethods: {},
          featureFlags: {},
          policies: {},
          registerPolicy: { requireOpeningAmount: false },
          quickProducts: { productIds: [] },
        });
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    const first = renderPosPage(fetchImpl, businessId);

    // Add Cola to the first tab.
    await user.type(await screen.findByLabelText("Buscar productos"), "cola");
    await user.click(await screen.findByRole("button", { name: /Cola/ }));

    // Open a second tab and add Sprite to it instead.
    await user.click(screen.getByRole("button", { name: "Nueva venta" }));
    await user.type(screen.getByLabelText("Buscar productos"), "sprite");
    await user.click(await screen.findByRole("button", { name: /Sprite/ }));
    expect(await screen.findByRole("button", { name: /Cobrar/ })).toHaveTextContent(/90,00/);

    // Switching back to the first tab shows Cola's total, not Sprite's.
    await user.click(screen.getByRole("button", { name: /^Venta 1/ }));
    expect(await screen.findByRole("button", { name: /Cobrar/ })).toHaveTextContent(/100,00/);

    // Unmounting flushes the debounced draft save immediately (see
    // use-pos-draft.ts) rather than requiring a real wait for the
    // production debounce window.
    first.unmount();
    await waitFor(async () => {
      const draft = await posCacheDatabase.posDrafts.get(businessId);
      expect(draft?.tabs).toHaveLength(2);
    });

    // A fresh mount (simulating a page reload) recovers both tabs, with
    // "Venta 1" (Cola, $100) still the active one -- that was the last
    // tab selected before unmounting above.
    renderPosPage(fetchImpl, businessId);
    expect(await screen.findByRole("button", { name: /^Venta 1/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Venta 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cobrar/ })).toHaveTextContent(/100,00/);
  });
});
