import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session-context";
import { BusinessProvider } from "../../lib/business/business-context";
import type { Product } from "../../lib/catalog/types";
import { ProductsScreen } from "./products-screen";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CATEGORY = { id: "cat-1", businessId: "biz-1", name: "Bebidas", status: "active" as const };

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: "prod-1",
    businessId: "biz-1",
    categoryId: CATEGORY.id,
    name: "Cola",
    description: null,
    saleMode: "unit",
    weightUnit: null,
    imageUrl: null,
    status: "active",
    identifiers: [],
    pricing: {
      costPrice: 5000,
      salePrice: 10000,
      profit: 5000,
      marginPercentBasisPoints: 10000,
      inputMode: "sale_price",
    },
    ...overrides,
  };
}

function renderScreen(
  fetchImpl: typeof fetch,
  permissions: string[] = ["catalog.manage", "pricing.manage"],
) {
  const queryClient = new QueryClient();
  const wrappedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
      return jsonResponse({ businessId: "biz-1", roleId: "role-1", permissions });
    }
    return (
      fetchImpl as unknown as (i: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    )(input, init);
  }) as unknown as typeof fetch;

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={wrappedFetch}>
        <BusinessProvider businessId="biz-1">
          <ProductsScreen businessId="biz-1" />
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ProductsScreen", () => {
  it("renders the fetched products with their category and price", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/categories")) {
        return jsonResponse([CATEGORY]);
      }
      if (url.includes("/configuration")) {
        return jsonResponse({ quickProducts: { productIds: [] } });
      }
      if (url.includes("/products")) {
        return jsonResponse({ data: [makeProduct({})], pagination: { nextCursor: null } });
      }
      throw new Error(`Unhandled: ${url}`);
    });

    renderScreen(fetchImpl);

    expect(await screen.findByText("Cola")).toBeInTheDocument();
    // "Bebidas" also appears in the category filter <select> and the
    // (closed) category manager dialog -- scope to the products table row.
    expect(screen.getByRole("cell", { name: "Bebidas" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /100,00/ })).toBeInTheDocument();
  });

  it("re-queries the API with the typed search term", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/categories")) {
        return jsonResponse([CATEGORY]);
      }
      if (url.includes("/configuration")) {
        return jsonResponse({ quickProducts: { productIds: [] } });
      }
      if (url.includes("/products")) {
        return jsonResponse({ data: [], pagination: { nextCursor: null } });
      }
      throw new Error(`Unhandled: ${url}`);
    });

    renderScreen(fetchImpl);
    await screen.findByText("No se encontraron productos.");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Buscar productos"), "cola");

    await waitFor(() => {
      const searchCall = fetchImpl.mock.calls.find(
        ([reqInput]) =>
          String(reqInput).includes("/products") && String(reqInput).includes("search=cola"),
      );
      expect(searchCall).toBeDefined();
    });
  });

  it("hides the manage/pricing actions for a caller without those permissions", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/categories")) {
        return jsonResponse([CATEGORY]);
      }
      if (url.includes("/configuration")) {
        return jsonResponse({ quickProducts: { productIds: [] } });
      }
      if (url.includes("/products")) {
        return jsonResponse({ data: [makeProduct({})], pagination: { nextCursor: null } });
      }
      throw new Error(`Unhandled: ${url}`);
    });

    renderScreen(fetchImpl, ["sales.create"]);

    await screen.findByText("Cola");
    expect(screen.queryByRole("button", { name: "Nuevo producto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Precio" })).not.toBeInTheDocument();
  });
});
