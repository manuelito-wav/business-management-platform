import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";

export interface RequestWithUser extends Request {
  user: Awaited<ReturnType<AuthService["validateAccessToken"]>>;
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length);
}

/**
 * Confirms the caller is authenticated. This is identity only -- it
 * does not check business membership, permissions, or resource
 * ownership, which the "enforce backend tenant authorization"
 * checkpoint adds on top of this once businesses/memberships exist.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    request.user = await this.authService.validateAccessToken(token);
    return true;
  }
}
