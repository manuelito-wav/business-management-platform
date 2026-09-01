import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AccessTokenGuard, type RequestWithUser } from "./access-token.guard";
import { AuthService, type AuthSession } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { ConfirmPasswordResetDto } from "./dto/confirm-password-reset.dto";
import { LoginDto } from "./dto/login.dto";
import { RequestPasswordResetDto } from "./dto/request-password-reset.dto";
import { REFRESH_TOKEN_COOKIE_NAME } from "./identity.constants";
import { PasswordResetService } from "./password-reset.service";

const REFRESH_COOKIE_PATH = "/auth";

function setRefreshCookie(res: Response, session: AuthSession): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, session.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: session.refreshTokenExpiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

function readRefreshCookie(req: Request): string {
  const token: unknown = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[
    REFRESH_TOKEN_COOKIE_NAME
  ];
  if (typeof token !== "string" || token.length === 0) {
    throw new UnauthorizedException("Missing refresh token.");
  }
  return token;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(
      dto.identifier,
      dto.password,
      req.headers["user-agent"],
    );
    setRefreshCookie(res, session);
    return { accessToken: session.accessToken, accessTokenExpiresAt: session.accessTokenExpiresAt };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.refresh(readRefreshCookie(req));
    setRefreshCookie(res, session);
    return { accessToken: session.accessToken, accessTokenExpiresAt: session.accessTokenExpiresAt };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[
      REFRESH_TOKEN_COOKIE_NAME
    ];
    if (typeof token === "string" && token.length > 0) {
      await this.authService.logout(token);
    }
    clearRefreshCookie(res);
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() user: RequestWithUser["user"]) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      activeBusinessId: user.activeBusinessId,
    };
  }

  @Post("password-reset")
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.passwordResetService.request(dto.email);
    return { message: "If that email is registered, a reset link has been sent." };
  }

  @Post("password-reset/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    await this.passwordResetService.confirm(dto.token, dto.newPassword);
  }
}
