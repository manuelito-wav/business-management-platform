import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./error";
import { apiRequest } from "./request";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest", () => {
  it("attaches the bearer token and always sends credentials for the refresh cookie", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));

    await apiRequest({
      apiBaseUrl: "https://api.test",
      path: "/things",
      accessToken: "token-123",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/things",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
  });

  it("omits the Authorization header when no token is given", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));

    await apiRequest({ apiBaseUrl: "https://api.test", path: "/things", fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("serializes the body as JSON and sets the content type", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));

    await apiRequest({
      apiBaseUrl: "https://api.test",
      path: "/things",
      method: "POST",
      body: { name: "Cola" },
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ name: "Cola" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for a 204 No Content response", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    const result = await apiRequest({ apiBaseUrl: "https://api.test", path: "/things", fetchImpl });

    expect(result).toBeUndefined();
  });

  it("throws an ApiError carrying the D-040 envelope's fields on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "PRODUCT_NOT_FOUND", message: "Not found.", correlationId: "corr-1" } },
        404,
      ),
    );

    await expect(
      apiRequest({ apiBaseUrl: "https://api.test", path: "/things/1", fetchImpl }),
    ).rejects.toMatchObject({
      status: 404,
      code: "PRODUCT_NOT_FOUND",
      correlationId: "corr-1",
    });
  });

  it("falls back to a generic ApiError when the failure response has no JSON body", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 500, statusText: "Server Error" }),
    );

    const error = await apiRequest({
      apiBaseUrl: "https://api.test",
      path: "/things",
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).code).toBe("UNKNOWN_ERROR");
  });
});
