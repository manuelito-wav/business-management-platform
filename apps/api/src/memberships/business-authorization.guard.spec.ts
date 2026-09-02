import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import {
  BusinessAuthorizationGuard,
  type RequestWithMembership,
} from "./business-authorization.guard";
import type { MembershipsService, MembershipWithRole } from "./memberships.service";

function contextFor(request: Partial<RequestWithMembership>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const membershipStub = { id: "membership-1", roleId: "role-1" } as unknown as MembershipWithRole;

describe("BusinessAuthorizationGuard", () => {
  it("resolves businessId from the route param when present", async () => {
    const requireActiveMembership = vi.fn().mockResolvedValue(membershipStub);
    const memberships = { requireActiveMembership } as unknown as MembershipsService;
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new BusinessAuthorizationGuard(memberships, reflector);

    const request: Partial<RequestWithMembership> = {
      params: { businessId: "business-from-path" },
      user: {
        id: "user-1",
        activeBusinessId: "business-from-session",
      } as RequestWithMembership["user"],
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(requireActiveMembership).toHaveBeenCalledWith("user-1", "business-from-path");
    expect(request.membership).toBe(membershipStub);
  });

  it("falls back to the session's active business when no route param exists", async () => {
    const requireActiveMembership = vi.fn().mockResolvedValue(membershipStub);
    const memberships = { requireActiveMembership } as unknown as MembershipsService;
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new BusinessAuthorizationGuard(memberships, reflector);

    const request: Partial<RequestWithMembership> = {
      params: {},
      user: {
        id: "user-1",
        activeBusinessId: "business-from-session",
      } as RequestWithMembership["user"],
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(requireActiveMembership).toHaveBeenCalledWith("user-1", "business-from-session");
  });

  it("fails when neither a route param nor an active business is available", async () => {
    const memberships = {
      requireActiveMembership: vi.fn(),
      requirePermission: vi.fn(),
    } as unknown as MembershipsService;
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new BusinessAuthorizationGuard(memberships, reflector);

    const request: Partial<RequestWithMembership> = {
      params: {},
      user: { id: "user-1", activeBusinessId: null } as RequestWithMembership["user"],
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      code: "MISSING_BUSINESS_SCOPE",
    });
    expect(memberships.requireActiveMembership).not.toHaveBeenCalled();
  });

  it("checks the specific permission when the route carries @RequirePermission", async () => {
    const requirePermission = vi.fn().mockResolvedValue(membershipStub);
    const memberships = { requirePermission } as unknown as MembershipsService;
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue("roles.manage"),
    } as unknown as Reflector;
    const guard = new BusinessAuthorizationGuard(memberships, reflector);

    const request: Partial<RequestWithMembership> = {
      params: { businessId: "business-1" },
      user: { id: "user-1", activeBusinessId: null } as RequestWithMembership["user"],
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(requirePermission).toHaveBeenCalledWith("user-1", "business-1", "roles.manage");
  });
});
