import { ApiError, type ApiErrorBody } from "./error";

export interface ApiRequestOptions {
  /** Origin only, no trailing slash (e.g. NEXT_PUBLIC_API_URL). */
  apiBaseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  /** Injectable for tests; defaults to the global fetch (same DI pattern as lib/pos-cache/refresh.ts). */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * A single low-level request against the API: attaches the bearer token
 * when present, always sends cookies (`credentials: "include"`) so
 * /auth/refresh and /auth/logout can read the httpOnly refresh cookie, and
 * turns a non-2xx response into an `ApiError` carrying the D-040 envelope.
 * Does not itself know about token refresh -- see
 * lib/auth/session-context.tsx's `authorizedRequest` for the
 * refresh-and-retry-once wrapper built on top of this.
 */
export async function apiRequest<T = unknown>(options: ApiRequestOptions): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetchImpl(`${options.apiBaseUrl}${options.path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const contentType = response.headers.get("content-type");
  const hasJsonBody = contentType?.includes("application/json") ?? false;
  const data = hasJsonBody ? ((await response.json()) as unknown) : undefined;

  if (!response.ok) {
    const envelope = data as { error?: ApiErrorBody } | undefined;
    throw new ApiError(
      response.status,
      envelope?.error ?? {
        code: "UNKNOWN_ERROR",
        message: response.statusText || "The request failed.",
        correlationId: "unknown",
      },
    );
  }

  return data as T;
}
