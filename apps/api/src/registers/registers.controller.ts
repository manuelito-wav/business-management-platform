import {
  Body,
  Controller,
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
import { RequirePermission } from "../memberships/require-permission.decorator";
import { CreateRegisterDto } from "./dto/create-register.dto";
import { UpdateRegisterDto } from "./dto/update-register.dto";
import { RegistersService } from "./registers.service";

@Controller("businesses/:businessId/registers")
@UseGuards(AccessTokenGuard, BusinessAuthorizationGuard)
export class RegistersController {
  constructor(private readonly registers: RegistersService) {}

  @Get()
  list(@CurrentUser() user: RequestWithUser["user"], @Param("businessId") businessId: string) {
    return this.registers.list(user.id, businessId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("register.manage")
  create(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Body() dto: CreateRegisterDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.registers.create(user.id, businessId, dto, correlationId);
  }

  @Patch(":registerId")
  @RequirePermission("register.manage")
  update(
    @CurrentUser() user: RequestWithUser["user"],
    @Param("businessId") businessId: string,
    @Param("registerId") registerId: string,
    @Body() dto: UpdateRegisterDto,
    @CorrelationId() correlationId: string,
  ) {
    return this.registers.update(user.id, businessId, registerId, dto, correlationId);
  }
}
