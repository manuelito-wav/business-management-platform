import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session-context";
import type { Product } from "../../lib/catalog/types";
import { QuickProductsManagerDialog } from "./quick-products-manager-dialog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: "prod-1",
    businessId: "biz-1",
    categoryId: "cat-1",
    name: "Cola",
    description: null,
    saleMode: "unit",
    weightUnit: null,
    imageUrl: null,
    status: "active",
    identifiers: [],
    pricing: null,
    ...overrides,
  };
}

interface RenderOptions {
  quickProductIds?: string[];
  products?: Product[];
  canManage?: boolean;
  onPatch?: (body: unknown) => void;
}

function renderDialog({
  quickProductIds = [],
  products = [],
  canManage = true,
  onPatch,
}: RenderOptions = {}) {
  const queryClient = new QueryClient();
  let currentQuickProductIds = quickProductIds;

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

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
    if (url.endsWith("/businesses/biz-1/configuration") && method === "PATCH") {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as { quickProducts: { productIds: string[] } })
        : null;
      onPatch?.(body);
      if (body) {
        currentQuickProductIds = body.quickProducts.productIds;
      }
      return jsonResponse({ quickProducts: { productIds: currentQuickProductIds } });
    }
    if (url.endsWith("/businesses/biz-1/configuration")) {
      return jsonResponse({ quickProducts: { productIds: currentQuickProductIds } });
    }
    if (url.includes("/businesses/biz-1/products/")) {
      const productId = url.split("/products/")[1];
      const found = products.find((product) => product.id === productId);
      if (!found) {
        return jsonResponse({ error: { code: "NOT_FOUND", message: "not found" } }, 404);
      }
      return jsonResponse(found);
    }
    if (url.includes("/businesses/biz-1/products")) {
      return jsonResponse({ data: products, pagination: { nextCursor: null } });
    }
    throw new Error(`Unhandled: ${url}`);
  }) as unknown as typeof fetch;

  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <QuickProductsManagerDialog
          businessId="biz-1"
          open
          onClose={onClose}
          canManage={canManage}
        />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { fetchImpl, onClose };
}

describe("QuickProductsManagerDialog", () => {
  it("shows the currently configured quick products by name, in configured order", async () => {
    renderDialog({
      quickProductIds: ["prod-2", "prod-1"],
      products: [
        makeProduct({ id: "prod-1", name: "Cola" }),
        makeProduct({ id: "prod-2", name: "Sprite" }),
      ],
    });

    await waitFor(() => {
      const items = screen.getAllByRole("listitem").map((item) => item.textContent);
      const spriteIndex = items.findIndex((text) => text?.includes("Sprite"));
      const colaIndex = items.findIndex((text) => text?.includes("Cola"));
      expect(spriteIndex).toBeGreaterThanOrEqual(0);
      expect(spriteIndex).toBeLessThan(colaIndex);
    });
  });

  it("adds a searched product to the quick products list", async () => {
    const onPatch = vi.fn();
    renderDialog({
      quickProductIds: [],
      products: [makeProduct({ id: "prod-1", name: "Cola" })],
      onPatch,
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Agregar producto"), "cola");

    const addButton = await screen.findByRole("button", { name: "Agregar" });
    await user.click(addButton);

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({ quickProducts: { productIds: ["prod-1"] } }),
    );
  });

  it("removes a product from the quick products list", async () => {
    const onPatch = vi.fn();
    renderDialog({
      quickProductIds: ["prod-1"],
      products: [makeProduct({ id: "prod-1", name: "Cola" })],
      onPatch,
    });

    const removeButton = await screen.findByRole("button", { name: "Quitar" });
    const user = userEvent.setup();
    await user.click(removeButton);

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({ quickProducts: { productIds: [] } }),
    );
  });

  it("reorders products with the up/down controls", async () => {
    const onPatch = vi.fn();
    renderDialog({
      quickProductIds: ["prod-1", "prod-2"],
      products: [
        makeProduct({ id: "prod-1", name: "Cola" }),
        makeProduct({ id: "prod-2", name: "Sprite" }),
      ],
      onPatch,
    });

    const moveDown = await screen.findByRole("button", { name: "Bajar Cola" });
    const user = userEvent.setup();
    await user.click(moveDown);

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({
        quickProducts: { productIds: ["prod-2", "prod-1"] },
      }),
    );
  });

  it("hides editing controls for a caller without configuration.manage", async () => {
    renderDialog({
      quickProductIds: ["prod-1"],
      products: [makeProduct({ id: "prod-1", name: "Cola" })],
      canManage: false,
    });

    await screen.findByText("Cola");
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Agregar producto")).not.toBeInTheDocument();
  });
});
