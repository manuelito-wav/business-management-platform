import { HttpStatus } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import { AppException, type ErrorDetail } from "./app-exception";

function flatten(errors: ValidationError[], parentPath = ""): ErrorDetail[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownMessages = Object.values(error.constraints ?? {}).map((message) => ({
      field: path,
      message,
    }));
    const childMessages = error.children?.length ? flatten(error.children, path) : [];
    return [...ownMessages, ...childMessages];
  });
}

/**
 * Wired into the global ValidationPipe so DTO validation failures come
 * out as the D-040 envelope with per-field details, instead of
 * NestJS's default `{ message: string[] }` shape.
 */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  return new AppException(
    "VALIDATION_FAILED",
    "One or more fields are invalid.",
    HttpStatus.BAD_REQUEST,
    flatten(errors),
  );
}
