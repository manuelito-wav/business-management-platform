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
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, type RequestWithUser } from "../identity/access-token.guard";
import { CurrentUser } from "../identity/current-user.decorator";
import { BusinessAuthorizationGuard } from "../memberships/business-authorization.guard";
import { RequirePermission } from "../memberships/require-permission.decorator";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import { ProductIdentifierInputDto } from "./dto/product-identifier-input.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

@Controller("businesses/:businessId/products")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Query() query: ListProductsDto,
  ) {
    return this.products.search(user.id, businessId, query);
  }

  @Get(":productId")
  findOne(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
  ) {
    return this.products.findOne(user.id, businessId, productId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("catalog.manage")
  create(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(user.id, businessId, dto);
  }

  @Patch(":productId")
  @RequirePermission("catalog.manage")
  update(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.id, businessId, productId, dto);
  }

  @Post(":productId/identifiers")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("catalog.manage")
  addIdentifier(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Body() dto: ProductIdentifierInputDto,
  ) {
    return this.products.addIdentifier(user.id, businessId, productId, dto);
  }

  @Delete(":productId/identifiers/:identifierId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("catalog.manage")
  async removeIdentifier(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("productId") productId: string,
    @Param("identifierId") identifierId: string,
  ) {
    await this.products.removeIdentifier(user.id, businessId, productId, identifierId);
  }
}
