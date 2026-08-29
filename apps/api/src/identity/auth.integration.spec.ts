import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { domainProviders } from "../common/domain-providers";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { PASSWORD_RESET_DELIVERY, type PasswordResetDeliveryPort } from "./password-reset-delivery";
import { PasswordHasherService } from "./password-hasher.service";
import { PasswordResetService } from "./password-reset.service";
import { TokenService } from "./token.service";
import { UsersService } from "./users.service";

class RecordingDelivery implements PasswordResetDeliveryPort {
  sent: { email: string; resetToken: string }[] = [];

  async send(email: string, resetToken: string): Promise<void> {
    this.sent.push({ email, resetToken });
  }
}

describe("Identity: register, login, refresh, logout, password reset", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let auth: AuthService;
  let passwordReset: PasswordResetService;
  let delivery: RecordingDelivery;

  beforeAll(async () => {
    delivery = new RecordingDelivery();
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        ...domainProviders,
        UsersService,
        AuthService,
        PasswordHasherService,
        TokenService,
        PasswordResetService,
        { provide: PASSWORD_RESET_DELIVERY, useValue: delivery },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    auth = moduleRef.get(AuthService);
    passwordReset = moduleRef.get(PasswordResetService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.userSession.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();
    delivery.sent = [];
  });

  it("registers a user without ever returning the password hash", async () => {
    const user = await users.create({ email: "cashier@kiosk.test", password: "correct-horse-1" });

    expect(user.email).toBe("cashier@kiosk.test");
    expect((user as { passwordHash?: unknown }).passwordHash).toBeDefined(); // sanity: field exists on the row
  });

  it("rejects registering the same email twice", async () => {
    await users.create({ email: "dup@kiosk.test", password: "correct-horse-1" });

    await expect(
      users.create({ email: "dup@kiosk.test", password: "another-pass-1" }),
    ).rejects.toMatchObject({
      code: "USER_ALREADY_EXISTS",
    });
  });

  it("logs in by email or by username with the correct password", async () => {
    await users.create({
      email: "owner@kiosk.test",
      username: "owner1",
      password: "correct-horse-1",
    });

    const byEmail = await auth.login("owner@kiosk.test", "correct-horse-1");
    const byUsername = await auth.login("owner1", "correct-horse-1");

    expect(byEmail.accessToken).not.toBe(byUsername.accessToken);
  });

  it("rejects an unknown identifier and a wrong password identically", async () => {
    await users.create({ email: "employee@kiosk.test", password: "correct-horse-1" });

    await expect(auth.login("nobody@kiosk.test", "whatever")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(auth.login("employee@kiosk.test", "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("validates a fresh access token back to the owning user", async () => {
    const user = await users.create({ email: "session@kiosk.test", password: "correct-horse-1" });
    const session = await auth.login("session@kiosk.test", "correct-horse-1");

    const validated = await auth.validateAccessToken(session.accessToken);

    expect(validated.id).toBe(user.id);
  });

  it("blocks login and existing sessions for an inactive account", async () => {
    const user = await users.create({ email: "inactive@kiosk.test", password: "correct-horse-1" });
    const session = await auth.login("inactive@kiosk.test", "correct-horse-1");

    await prisma.user.update({ where: { id: user.id }, data: { status: "inactive" } });

    await expect(auth.login("inactive@kiosk.test", "correct-horse-1")).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE",
    });
    await expect(auth.validateAccessToken(session.accessToken)).rejects.toBeDefined();
  });

  it("rotates the refresh token and invalidates the previous one", async () => {
    await users.create({ email: "refresh@kiosk.test", password: "correct-horse-1" });
    const original = await auth.login("refresh@kiosk.test", "correct-horse-1");

    const rotated = await auth.refresh(original.refreshToken);

    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    await expect(auth.refresh(original.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("revokes the session on logout so its access token stops working", async () => {
    await users.create({ email: "logout@kiosk.test", password: "correct-horse-1" });
    const session = await auth.login("logout@kiosk.test", "correct-horse-1");

    await auth.logout(session.refreshToken);

    await expect(auth.validateAccessToken(session.accessToken)).rejects.toBeDefined();
    await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("does not reveal whether an email is registered when requesting a reset", async () => {
    await users.create({ email: "known@kiosk.test", password: "correct-horse-1" });

    await expect(passwordReset.request("known@kiosk.test")).resolves.toBeUndefined();
    await expect(passwordReset.request("unknown@kiosk.test")).resolves.toBeUndefined();
    expect(delivery.sent).toHaveLength(1);
    expect(delivery.sent[0]?.email).toBe("known@kiosk.test");
  });

  it("resets the password, invalidates the token, and revokes existing sessions", async () => {
    await users.create({ email: "reset@kiosk.test", password: "old-password-1" });
    const session = await auth.login("reset@kiosk.test", "old-password-1");
    await passwordReset.request("reset@kiosk.test");
    const delivered = delivery.sent[0];
    expect(delivered).toBeDefined();
    const resetToken = delivered?.resetToken ?? "";

    await passwordReset.confirm(resetToken, "new-password-1");

    // Old password no longer works, new one does.
    await expect(auth.login("reset@kiosk.test", "old-password-1")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(auth.login("reset@kiosk.test", "new-password-1")).resolves.toBeDefined();
    // The session that existed before the reset is gone.
    await expect(auth.validateAccessToken(session.accessToken)).rejects.toBeDefined();
    // The reset token is single-use.
    await expect(passwordReset.confirm(resetToken, "another-password-1")).rejects.toMatchObject({
      code: "INVALID_RESET_TOKEN",
    });
  });
});
