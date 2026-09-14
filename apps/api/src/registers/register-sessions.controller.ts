import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { CloseRegisterSessionDto } from "./dto/close-register-session.dto";
import { OpenRegisterSessionDto } from "./dto/open-register-session.dto";
import { RegisterSessionsService } from "./register-sessions.service";

/**
 * No @RequirePermission on open/close: any active member may open a
 * register session for themselves and close their own (see
 * RegisterSessionsService's own doc comment for why). Closing someone
 * else's session is a distinct, privileged path -- RegisterSessionsService.
 * close() itself checks for register.override_close_conflict (D-045),
 * the same two-layer authorization pattern (controller guard is
 * business-membership-only; the service re-checks the specific
 * permission) used everywhere else in this codebase.
 */
@Controller("businesses/:businessId")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class RegisterSessionsController {
  constructor(private readonly sessions: RegisterSessionsService) {}

  @Post("registers/:registerId/sessions")
  open(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("registerId") registerId: string,
    @Body() dto: OpenRegisterSessionDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sessions.open(user.id, businessId, registerId, dto, correlationId);
  }

  @Get("register-sessions")
  list(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Query("registerId") registerId?: string,
    @Query("status") status?: "open" | "closed",
  ) {
    return this.sessions.list(user.id, businessId, { registerId, status });
  }

  @Get("register-sessions/mine")
  mine(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.sessions.findMyOpenSession(user.id, businessId);
  }

  @Post("register-sessions/:sessionId/close")
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: CloseRegisterSessionDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sessions.close(user.id, businessId, sessionId, dto, correlationId);
  }
}
