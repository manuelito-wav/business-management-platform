import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RequestWithUser } from "../identity/access-token.guard";
import { AppException } from "../common/app-exception";
import { MembershipsService, type MembershipWithRole } from "./memberships.service";
import { PERMISSION_METADATA_KEY } from "./require-permission.decorator";

export interface RequestWithMembership extends RequestWithUser {
  membership: MembershipWithRole;
}

/**
 * Resolves the business in scope for this request -- an explicit
 * `:businessId` route param when the route has one, otherwise the
 * session's active business (SPECS.md 4.2) -- then validates active
 * membership and, when the route carries @RequirePermission, the
 * specific permission. Missing business scope (neither source
 * available) is a failure (ROADMAP.md), not a silent pass-through.
 *
 * Must run after AccessTokenGuard (`@UseGuards(AccessTokenGuard,
 * BusinessAuthorizationGuard)`, in that order) since it reads
 * `request.user`. Covers 4 of ARCHITECTURE.md Tenancy's 5 checks:
 * authentication (delegated to AccessTokenGuard), active business,
 * membership, permission. Resource ownership beyond the resolved
 * business itself (e.g. "does this specific membership row belong to
 * this business") stays a service-level concern in whichever module
 * owns that resource -- it depends on fetching the resource, which only
 * the owning service can do without reaching into another module's
 * tables (ARCHITECTURE.md Modules).
 */
@Injectable()
export class BusinessAuthorizationGuard implements CanActivate {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMembership>();

    const businessId: unknown = request.params["businessId"] ?? request.user.activeBusinessId;
    if (typeof businessId !== "string" || businessId.length === 0) {
      throw new AppException(
        "MISSING_BUSINESS_SCOPE",
        "No business was specified and no active business is selected.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const permissionCode = this.reflector.get<string | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );

    request.membership = permissionCode
      ? await this.memberships.requirePermission(request.user.id, businessId, permissionCode)
      : await this.memberships.requireActiveMembership(request.user.id, businessId);

    return true;
  }
}
