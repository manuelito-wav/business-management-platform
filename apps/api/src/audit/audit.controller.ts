import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../identity/access-token.guard";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { AuditService } from "./audit.service";
import { ListAuditEventsDto } from "./dto/list-audit-events.dto";

@Controller("businesses/:businessId/audit-events")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // @RequirePermission is read via Reflector.get(key, context.getHandler())
  // (see BusinessAuthorizationGuard), which only sees method-level
  // metadata -- it must go on the route handler, not the class, to
  // actually be enforced.
  @Get()
  @RequirePermission("audit.view")
  list(@Param("businessId") businessId: string, @Query() query: ListAuditEventsDto) {
    return this.audit.list(businessId, { cursor: query.cursor, limit: query.limit });
  }
}
