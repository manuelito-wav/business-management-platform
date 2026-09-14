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
import { AddPaymentDto } from "./dto/add-payment.dto";
import { SaleLineInputDto } from "./dto/sale-line-input.dto";
import { SettleSaleDto } from "./dto/settle-sale.dto";
import { StartSaleDto } from "./dto/start-sale.dto";
import { UpdateSaleLineDto } from "./dto/update-sale-line.dto";
import { SalesService } from "./sales.service";

/**
 * Not yet called by the POS UI (see SalesService's own doc comment) --
 * exercised here and in tests as a complete, standalone HTTP surface,
 * ready for the POS to wire up. Lines and payments (SPECS.md 6.6/10.2's
 * split payments) are both built up incrementally while a sale is
 * `in_progress`; `complete` finalizes it via SalesService.settle, the one
 * transactional command that also writes the inventory/cash effects,
 * outbox event, and completion audit record. SalesService.complete
 * itself (the narrower, composable status transition `settle` calls
 * internally) is NOT exposed as its own route. `abandon` is likewise not
 * exposed: it is meant to be driven by a policy check
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
    @Body() dto: StartSaleDto,
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

  @Post(":saleId/complete")
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Body() dto: SettleSaleDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.settle(user.id, businessId, saleId, dto, correlationId);
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

  @Post(":saleId/payments")
  addPayment(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Body() dto: AddPaymentDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.addPayment(user.id, businessId, saleId, dto, correlationId);
  }

  @Delete(":saleId/payments/:paymentId")
  removePayment(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Param("paymentId") paymentId: string,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.removePayment(user.id, businessId, saleId, paymentId, correlationId);
  }

  @Post(":saleId/payments/:paymentId/verify")
  @HttpCode(HttpStatus.OK)
  verifyPayment(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("saleId") saleId: string,
    @Param("paymentId") paymentId: string,
    @CorrelationId() correlationId: string,
  ) {
    return this.sales.verifyPayment(user.id, businessId, saleId, paymentId, correlationId);
  }
}
