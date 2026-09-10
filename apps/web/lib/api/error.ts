/** The D-040 REST error envelope's `error` object, verbatim from the API. */
export interface ApiErrorBody {
  code: string;
  message: string;
  correlationId: string;
  details?: { field: string; message: string }[];
}

/** Thrown by `apiRequest` for any non-2xx response, carrying the D-040 envelope's fields. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string;
  readonly details?: { field: string; message: string }[];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.correlationId = body.correlationId;
    this.details = body.details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
