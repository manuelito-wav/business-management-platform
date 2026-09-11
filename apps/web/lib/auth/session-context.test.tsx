import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./session-context";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Exposes useAuth's state/actions through the DOM so tests can drive and assert on them. */
function AuthProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="email">{auth.user?.email ?? ""}</span>
      <span data-testid="access-token">{auth.getAccessToken() ?? ""}</span>
      <button onClick={() => void auth.login("owner@kiosk.test", "correct-horse-1")}>login</button>
      <button onClick={() => void auth.logout()}>logout</button>
      <button
        onClick={() =>
          void auth
            .authorizedRequest("/protected")
            .then((result) => {
              document.getElementById("result")!.textContent = JSON.stringify(result);
            })
            .catch((error: unknown) => {
              document.getElementById("result")!.textContent = `error:${(error as Error).message}`;
            })
        }
      >
        call
      </button>
      <div id="result" data-testid="result" />
    </div>
  );
}

function renderProbe(fetchImpl: typeof fetch) {
  return render(
    <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
      <AuthProbe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  it("starts unauthenticated when the silent refresh on mount fails", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "No session.", correlationId: "x" } },
        401,
      ),
    );
    renderProbe(fetchImpl);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
  });

  it("restores the session via /auth/refresh and /auth/me on mount", async () => {
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
      throw new Error(`Unhandled: ${url}`);
    });
    renderProbe(fetchImpl);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("owner@kiosk.test");
  });

  it("getAccessToken exposes the current bearer token for callers that need it directly, and clears on logout", async () => {
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
      if (url.endsWith("/auth/logout")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unhandled: ${url}`);
    });
    renderProbe(fetchImpl);

    await waitFor(() => expect(screen.getByTestId("access-token")).toHaveTextContent("token-1"));

    const user = userEvent.setup();
    await user.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("access-token")).toHaveTextContent("");
  });

  it("authorizedRequest silently refreshes once on a 401 and retries the call", async () => {
    let refreshCallCount = 0;
    let protectedCallCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCallCount += 1;
        // The second /auth/refresh call (triggered by the 401 below) mints a fresh token.
        return jsonResponse({
          accessToken: refreshCallCount === 1 ? "token-1" : "token-2",
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
      if (url.endsWith("/protected")) {
        protectedCallCount += 1;
        const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
        // The token expired server-side between mount and this call -- the
        // *first* call (still carrying the original token) is rejected; a
        // fresh refresh must be silently attempted before a second,
        // successful retry with the new token.
        if (protectedCallCount === 1) {
          expect(authHeader).toBe("Bearer token-1");
          return jsonResponse(
            { error: { code: "UNAUTHORIZED", message: "Token expired.", correlationId: "x" } },
            401,
          );
        }
        expect(authHeader).toBe("Bearer token-2");
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled: ${url}`);
    });

    renderProbe(fetchImpl);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    const user = userEvent.setup();
    await user.click(screen.getByText("call"));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent(JSON.stringify({ ok: true })),
    );
    expect(protectedCallCount).toBe(2);
    expect(refreshCallCount).toBe(2);
  });

  it("clears the session when the retried request also fails authentication", async () => {
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
      if (url.endsWith("/protected")) {
        return jsonResponse(
          { error: { code: "UNAUTHORIZED", message: "Nope.", correlationId: "x" } },
          401,
        );
      }
      throw new Error(`Unhandled: ${url}`);
    });
    renderProbe(fetchImpl);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    const user = userEvent.setup();
    await user.click(screen.getByText("call"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("result")).toHaveTextContent("error:Nope.");
  });
});
