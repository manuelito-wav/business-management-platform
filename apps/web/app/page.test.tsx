import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth/session-context";
import HomePage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  replace.mockClear();
});

describe("HomePage", () => {
  it("redirects to /login when there is no session to restore", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "No session.", correlationId: "x" } },
        401,
      ),
    );

    render(
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl as unknown as typeof fetch}>
        <HomePage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to the caller's active business when a session restores with one set", async () => {
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
          email: "a@b.test",
          username: null,
          activeBusinessId: "biz-1",
        });
      }
      throw new Error(`Unhandled fake fetch request: ${url}`);
    });

    render(
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl as unknown as typeof fetch}>
        <HomePage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/biz-1");
    });
  });

  it("redirects to /select-business when authenticated without an active business", async () => {
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
          email: "a@b.test",
          username: null,
          activeBusinessId: null,
        });
      }
      throw new Error(`Unhandled fake fetch request: ${url}`);
    });

    render(
      <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl as unknown as typeof fetch}>
        <HomePage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/select-business");
    });
  });
});
