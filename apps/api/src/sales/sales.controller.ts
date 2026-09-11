import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { SaleLineInputDto } from "./dto/sale-line-input.dto";
import { UpdateSaleLineDto } from "./dto/update-sale-line.dto";
import { SalesService } from "./sales.service";

/**
 * Not yet called by the POS UI (see SalesService's own doc comment) --
 * exercised here and in tests as a complete, standalone HTTP surface,
 * ready for ROADMAP.md's later checkpoints to wire up. `complete` is
 * deliberately NOT exposed here: SalesService.complete is composable-only,
 * meant to be called from within the later "settle sales with stock and
 * cash effects" checkpoint's own transaction, not as its own bare action
 * (SPECS.md 6.6: "The sale can only complete when the required amount is
 * satisfied" -- payment validation does not exist yet). `abandon` is
 * likewise not exposed: it is meant to be driven by a policy check
 * (SalesService.isSaleAbandoned), not a direct user action.
 */
@Controller("businesses/:businessId/sales")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  start(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: SaleLineInputDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.start(user.id, businessId, dto, correlationId);
  }

  @Get(":saleId")
  findOne(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
  ) {
    return this.sales.findOne(user.id, businessId, saleId);
  }

  @Post(":saleId/lines")
  addLine(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Body() dto: SaleLineInputDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.addLine(user.id, businessId, saleId, dto, correlationId);
  }

  @Patch(":saleId/lines/:lineId")
  updateLineQuantity(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateSaleLineDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.updateLineQuantity(
      user.id,
      businessId,
      saleId,
      lineId,
      dto.quantity,
      correlationId,
    );
  }

  @Delete(":saleId/lines/:lineId")
  removeLine(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Param("lineId") lineId: string,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.removeLine(user.id, businessId, saleId, lineId, correlationId);
  }

  @Post(":saleId/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.cancel(user.id, businessId, saleId, correlationId);
  }
}
