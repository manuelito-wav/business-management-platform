import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Clock, IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { PrismaService } from "../prisma/prisma.service";
import { PASSWORD_RESET_TOKEN_TTL_MS } from "./identity.constants";
import { PASSWORD_RESET_DELIVERY, type PasswordResetDeliveryPort } from "./password-reset-delivery";
import { PasswordHasherService } from "./password-hasher.service";
import { TokenService } from "./token.service";
import { UsersService } from "./users.service";

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokens: TokenService,
    @Inject(PASSWORD_RESET_DELIVERY) private readonly delivery: PasswordResetDeliveryPort,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Always resolves the same way regardless of whether the email
   * exists, so the response never reveals which emails are registered.
   */
  async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    const issued = this.tokens.issue();

    if (!user) {
      return;
    }

    await this.prisma.passwordResetToken.create({
      data: {
        id: this.ids.generate(),
        userId: user.id,
        tokenHash: issued.hash,
        expiresAt: new Date(this.clock.now().getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    await this.delivery.send(user.email, issued.token);
  }

  async confirm(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.tokens.hash(rawToken);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < this.clock.now()) {
      throw new AppException(
        "INVALID_RESET_TOKEN",
        "This password reset link is invalid or has expired.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    const now = this.clock.now();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      }),
      // A password reset is a credential compromise recovery action --
      // every other active session must stop working immediately.
      this.prisma.userSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
