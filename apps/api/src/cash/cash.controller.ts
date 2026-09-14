import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { CashService } from "./cash.service";
import { RecordCashMovementDto } from "./dto/record-cash-movement.dto";

@Controller("businesses/:businessId/register-sessions/:sessionId/cash-movements")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Post()
  record(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: RecordCashMovementDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.cash.recordMovement(user.id, businessId, sessionId, dto, correlationId);
  }

  @Get()
  list(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.cash.list(user.id, businessId, sessionId);
  }
}
