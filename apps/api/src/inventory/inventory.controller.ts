import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { ReceiveStockDto } from "./dto/receive-stock.dto";
import { RecordLossDto } from "./dto/record-loss.dto";
import { InventoryService } from "./inventory.service";

/**
 * Reading current stock is routine operational information, the same
 * precedent as ProductsController.list/findOne (no @RequirePermission).
 * Every write route below is permission-gated both here
 * (@RequirePermission, enforced by BusinessAuthorizationGuard) and again
 * inside InventoryService (the established two-layer pattern -- see
 * PricingController/PricingService).
 */
@Controller("businesses/:businessId/products/:productId/stock")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  getStock(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
  ) {
    return this.inventory.getStock(user.id, businessId, productId);
  }

  @Post("receive")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inventory.adjust")
  receive(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: ReceiveStockDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.inventory.receiveStock(user.id, businessId, productId, dto, correlationId);
  }

  @Post("adjust")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inventory.adjust")
  adjust(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: AdjustStockDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.inventory.adjustStock(user.id, businessId, productId, dto, correlationId);
  }

  @Post("loss")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inventory.record_loss")
  recordLoss(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: RecordLossDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.inventory.recordLoss(user.id, businessId, productId, dto, correlationId);
  }
}
