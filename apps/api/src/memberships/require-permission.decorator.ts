import { SetMetadata } from "@nestjs/common";

export const PERMISSION_METADATA_KEY = "requiredPermission";

/**
 * Marks a route handler as requiring a specific permission (D-038,
 * `<module>.<action>`), evaluated by BusinessAuthorizationGuard. Omit this
 * decorator for a route that only needs active membership in the resolved
 * business, with no elevated permission (for example a plain roster read).
 */
export const RequirePermission = (permissionCode: string) =>
  SetMetadata(PERMISSION_METADATA_KEY, permissionCode);
