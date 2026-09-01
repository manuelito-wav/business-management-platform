import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithMembership } from "./business-authorization.guard";

/** The membership BusinessAuthorizationGuard resolved for this request. */
export const CurrentMembership = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithMembership>();
  return request.membership;
});
