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
  Put,
  UseGuards,
} from "@nestjs/common";
import { CorrelationId } from "../common/correlation-id.decorator";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { CreatePriceListDto } from "./dto/create-price-list.dto";
import { SetPriceListEntryDto } from "./dto/set-price-list-entry.dto";
import { UpdatePriceListDto } from "./dto/update-price-list.dto";
import { PriceListsService } from "./price-lists.service";

@Controller("businesses/:businessId/price-lists")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.priceLists.list(user.id, businessId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("pricing.manage")
  create(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: CreatePriceListDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.priceLists.create(user.id, businessId, dto, correlationId);
  }

  @Patch(":priceListId")
  @RequirePermission("pricing.manage")
  update(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("priceListId") priceListId: string,
    @Body() dto: UpdatePriceListDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.priceLists.update(user.id, businessId, priceListId, dto, correlationId);
  }

  @Put(":priceListId/entries/:productId")
  @RequirePermission("pricing.manage")
  setEntry(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("priceListId") priceListId: string,
    @Param("productId") productId: string,
    @Body() dto: SetPriceListEntryDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.priceLists.setEntry(
      user.id,
      businessId,
      priceListId,
      productId,
      dto,
      correlationId,
    );
  }

  @Delete(":priceListId/entries/:productId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("pricing.manage")
  async removeEntry(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("priceListId") priceListId: string,
    @Param("productId") productId: string,
    @CorrelationId() correlationId: string,
  ) {
    await this.priceLists.removeEntry(user.id, businessId, priceListId, productId, correlationId);
  }
}
