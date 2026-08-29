import { HttpException, HttpStatus } from "@nestjs/common";

export interface ErrorDetail {
  field: string;
  message: string;
}

/**
 * Throw this (instead of a plain NestJS HttpException) whenever the
 * caller needs a stable, specific `code` per D-040 -- e.g.
 * "INVALID_CREDENTIALS" rather than the generic "UNAUTHORIZED" a plain
 * UnauthorizedException would produce.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    public readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}
