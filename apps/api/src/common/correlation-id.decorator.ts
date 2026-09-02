import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithCorrelationId } from "./middleware/correlation-id.middleware";

/** The correlation ID CorrelationIdMiddleware stamped on this request (D-040/D-043). */
export const CorrelationId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithCorrelationId>();
  return request.correlationId;
});
