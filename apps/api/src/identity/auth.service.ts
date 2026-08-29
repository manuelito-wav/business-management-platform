import { HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Clock, IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { PrismaService } from "../prisma/prisma.service";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./identity.constants";
import { PasswordHasherService } from "./password-hasher.service";
import { TokenService } from "./token.service";
import { UsersService } from "./users.service";

export interface AuthSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const INVALID_CREDENTIALS_MESSAGE = "Invalid credentials.";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokens: TokenService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async login(identifier: string, password: string, userAgent?: string): Promise<AuthSession> {
    const user = await this.users.findByEmailOrUsername(identifier);
    if (!user) {
      // Hash a dummy value so a non-existent identifier takes roughly
      // the same time as a real one, avoiding a user-enumeration
      // timing side-channel.
      await this.passwordHasher.hash(password);
      throw new AppException(
        "INVALID_CREDENTIALS",
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const validPassword = await this.passwordHasher.verify(user.passwordHash, password);
    if (!validPassword) {
      throw new AppException(
        "INVALID_CREDENTIALS",
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Only checked after the password is confirmed correct: revealing
    // "this account is inactive" to someone who does not know the
    // password would itself leak that the account exists.
    if (user.status !== "active") {
      throw new AppException("ACCOUNT_INACTIVE", "This account is inactive.", HttpStatus.FORBIDDEN);
    }

    return this.createSession(user.id, userAgent);
  }

  async refresh(rawRefreshToken: string): Promise<AuthSession> {
    const refreshTokenHash = this.tokens.hash(rawRefreshToken);
    const session = await this.prisma.userSession.findUnique({ where: { refreshTokenHash } });

    if (!session || session.revokedAt || session.refreshTokenExpiresAt < this.clock.now()) {
      throw new AppException(
        "INVALID_REFRESH_TOKEN",
        "The refresh token is invalid or has expired.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Rotate: revoke the used refresh token and issue a brand new
    // session, so a stolen-but-already-used refresh token is a
    // detectable replay rather than a silently reusable credential.
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: this.clock.now() },
    });

    return this.createSession(session.userId, session.userAgent ?? undefined);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const refreshTokenHash = this.tokens.hash(rawRefreshToken);
    const session = await this.prisma.userSession.findUnique({ where: { refreshTokenHash } });
    if (!session || session.revokedAt) {
      return;
    }
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: this.clock.now() },
    });
  }

  /** Used by the access-token guard on every protected request. */
  async validateAccessToken(rawAccessToken: string) {
    const accessTokenHash = this.tokens.hash(rawAccessToken);
    const session = await this.prisma.userSession.findUnique({
      where: { accessTokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.accessTokenExpiresAt < this.clock.now()) {
      throw new UnauthorizedException("The access token is invalid or has expired.");
    }

    if (session.user.status !== "active") {
      throw new UnauthorizedException("This account is inactive.");
    }

    return session.user;
  }

  private async createSession(userId: string, userAgent?: string): Promise<AuthSession> {
    const access = this.tokens.issue();
    const refresh = this.tokens.issue();
    const now = this.clock.now();
    const accessTokenExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.userSession.create({
      data: {
        id: this.ids.generate(),
        userId,
        accessTokenHash: access.hash,
        accessTokenExpiresAt,
        refreshTokenHash: refresh.hash,
        refreshTokenExpiresAt,
        userAgent,
      },
    });

    return {
      accessToken: access.token,
      accessTokenExpiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt,
    };
  }
}
