import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session-context";
import { RegisterSelector } from "./register-selector";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function baseHandlers(registerPolicy: { requireOpeningAmount: boolean }) {
  return (input: RequestInfo | URL) => {
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
    if (url.endsWith("/businesses/biz-1/configuration")) {
      return jsonResponse({ businessTimezone: "America/Argentina/Buenos_Aires", registerPolicy });
    }
    return undefined;
  };
}

function renderSelector(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <RegisterSelector businessId="biz-1" />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("RegisterSelector", () => {
  it("lists registers and opens a session when one is clicked (no opening amount required)", async () => {
    let openCalled: unknown = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const base = baseHandlers({ requireOpeningAmount: false })(input);
      if (base) {
        return base;
      }
      if (url.endsWith("/businesses/biz-1/registers")) {
        return jsonResponse([
          { id: "reg-1", businessId: "biz-1", name: "Caja 1", status: "active" },
          { id: "reg-2", businessId: "biz-1", name: "Caja 2 (inactiva)", status: "inactive" },
        ]);
      }
      if (url.endsWith("/businesses/biz-1/registers/reg-1/sessions")) {
        openCalled = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            id: "sess-1",
            businessId: "biz-1",
            registerId: "reg-1",
            userId: "user-1",
            status: "open",
          },
          201,
        );
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;
    renderSelector(fetchImpl);

    expect(await screen.findByText("Caja 1")).toBeInTheDocument();
    const inactiveButton = screen.getByRole("button", { name: /Caja 2/ });
    expect(inactiveButton).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Caja 1/ }));

    await waitFor(() => expect(openCalled).toEqual({ openingAmount: undefined }));
  });

  it("requires an opening amount when the business's registerPolicy demands one", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const base = baseHandlers({ requireOpeningAmount: true })(input);
      if (base) {
        return base;
      }
      if (url.endsWith("/businesses/biz-1/registers")) {
        return jsonResponse([
          { id: "reg-1", businessId: "biz-1", name: "Caja 1", status: "active" },
        ]);
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;
    renderSelector(fetchImpl);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Caja 1/ }));

    expect(
      await screen.findByText("Este negocio requiere un monto de apertura."),
    ).toBeInTheDocument();
  });

  it("sends the opening amount converted to integer minor units", async () => {
    let openCalled: unknown = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const base = baseHandlers({ requireOpeningAmount: true })(input);
      if (base) {
        return base;
      }
      if (url.endsWith("/businesses/biz-1/registers")) {
        return jsonResponse([
          { id: "reg-1", businessId: "biz-1", name: "Caja 1", status: "active" },
        ]);
      }
      if (url.endsWith("/businesses/biz-1/registers/reg-1/sessions")) {
        openCalled = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            id: "sess-1",
            businessId: "biz-1",
            registerId: "reg-1",
            userId: "user-1",
            status: "open",
          },
          201,
        );
      }
      throw new Error(`Unhandled: ${url}`);
    }) as unknown as typeof fetch;
    renderSelector(fetchImpl);

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Monto de apertura"), "150.50");
    await user.click(screen.getByRole("button", { name: /Caja 1/ }));

    await waitFor(() => expect(openCalled).toEqual({ openingAmount: 15050 }));
  });
});
