import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth/session-context";
import LoginPage from "./page";

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

function renderLoginPage(fetchImpl: typeof fetch) {
  return render(
    <AuthProvider apiBaseUrl="https://api.test" fetchImpl={fetchImpl}>
      <LoginPage />
    </AuthProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
});

describe("LoginPage", () => {
  it("shows validation errors instead of submitting when fields are empty", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    renderLoginPage(fetchImpl);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Ingresá tu usuario o email.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá tu contraseña.")).toBeInTheDocument();
    // Only the initial silent /auth/refresh -- no /auth/login call was made.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("logs in and redirects to the returned active business", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(
          { error: { code: "UNAUTHORIZED", message: "No session.", correlationId: "x" } },
          401,
        );
      }
      if (url.endsWith("/auth/login")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          identifier: "owner@kiosk.test",
          password: "correct-horse-1",
        });
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
      throw new Error(`Unhandled fake fetch request: ${url}`);
    }) as unknown as typeof fetch;
    renderLoginPage(fetchImpl);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Usuario o email"), "owner@kiosk.test");
    await user.type(screen.getByLabelText("Contraseña"), "correct-horse-1");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/biz-1");
    });
  });

  it("shows the server's error message on invalid credentials", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(
          { error: { code: "UNAUTHORIZED", message: "No session.", correlationId: "x" } },
          401,
        );
      }
      if (url.endsWith("/auth/login")) {
        return jsonResponse(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Usuario o contraseña incorrectos.",
              correlationId: "x",
            },
          },
          401,
        );
      }
      throw new Error(`Unhandled fake fetch request: ${url}`);
    }) as unknown as typeof fetch;
    renderLoginPage(fetchImpl);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Usuario o email"), "owner@kiosk.test");
    await user.type(screen.getByLabelText("Contraseña"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos.");
    expect(replace).not.toHaveBeenCalled();
  });
});
