import { Module } from "@nestjs/common";
import { domainProviders } from "../common/domain-providers";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoggingPasswordResetDelivery, PASSWORD_RESET_DELIVERY } from "./password-reset-delivery";
import { PasswordResetService } from "./password-reset.service";
import { PasswordHasherService } from "./password-hasher.service";
import { TokenService } from "./token.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController, AuthController],
  providers: [
    ...domainProviders,
    UsersService,
    AuthService,
    PasswordHasherService,
    TokenService,
    PasswordResetService,
    AccessTokenGuard,
    { provide: PASSWORD_RESET_DELIVERY, useClass: LoggingPasswordResetDelivery },
  ],
  exports: [AuthService, UsersService],
})
export class IdentityModule {}
