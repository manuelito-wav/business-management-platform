import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session-context";
import SelectBusinessPage from "./page";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
        <SelectBusinessPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

describe("SelectBusinessPage", () => {
  it("lists the caller's businesses and navigates to the chosen one", async () => {
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
          activeBusinessId: null,
        });
      }
      if (url.endsWith("/businesses")) {
        return jsonResponse([
          {
            businessId: "biz-1",
            businessName: "Kiosco Centro",
            roleId: "role-1",
            roleName: "Owner",
          },
          {
            businessId: "biz-2",
            businessName: "Kiosco Norte",
            roleId: "role-2",
            roleName: "Employee",
          },
        ]);
      }
      throw new Error(`Unhandled fake fetch request: ${url}`);
    }) as unknown as typeof fetch;
    renderPage(fetchImpl);
    const user = userEvent.setup();

    expect(await screen.findByText("Kiosco Centro")).toBeInTheDocument();
    expect(screen.getByText("Kiosco Norte")).toBeInTheDocument();

    await user.click(screen.getByText("Kiosco Centro"));

    expect(push).toHaveBeenCalledWith("/biz-1");
  });

  it("shows an empty-state message when the caller belongs to no business", async () => {
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
          activeBusinessId: null,
        });
      }
      if (url.endsWith("/businesses")) {
        return jsonResponse([]);
      }
      throw new Error(`Unhandled fake fetch request: ${url}`);
    }) as unknown as typeof fetch;
    renderPage(fetchImpl);

    expect(await screen.findByText("Todavía no pertenecés a ningún negocio.")).toBeInTheDocument();
  });

  it("redirects to /login once the session turns out to be unauthenticated", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "No session.", correlationId: "x" } },
        401,
      ),
    ) as unknown as typeof fetch;
    renderPage(fetchImpl);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });
});
