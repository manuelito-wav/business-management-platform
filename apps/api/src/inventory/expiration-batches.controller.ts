import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { CreateExpirationBatchDto } from "./dto/create-expiration-batch.dto";
import { ExpirationBatchesService } from "./expiration-batches.service";

@Controller("businesses/:businessId/products/:productId/expiration-batches")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class ExpirationBatchesController {
  constructor(private readonly expirationBatches: ExpirationBatchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("inventory.adjust")
  create(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: CreateExpirationBatchDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.expirationBatches.createBatch(user.id, businessId, productId, dto, correlationId);
  }

  @Post(":batchId/resolve")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inventory.adjust")
  resolve(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Param("batchId") batchId: string,
    @CorrelationId() correlationId: string,
  ) {
    return this.expirationBatches.resolveBatch(
      user.id,
      businessId,
      productId,
      batchId,
      correlationId,
    );
  }
}
