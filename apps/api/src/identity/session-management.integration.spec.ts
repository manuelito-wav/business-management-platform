import "reflect-metadata";
import { Uuidv7Generator } from "@bmp/domain";
import { FixedClock } from "@bmp/domain/testing";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLOCK, ID_GENERATOR } from "../common/domain-providers";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { PasswordHasherService } from "./password-hasher.service";
import { SESSION_LAST_USED_TOUCH_INTERVAL_MS } from "./identity.constants";
import { TokenService } from "./token.service";
import { UsersService } from "./users.service";

describe("Session/device management", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let auth: AuthService;
  let clock: FixedClock;

  // Comfortably ahead of real wall-clock time: `createdAt`/`lastUsedAt`
  // default to the database's own `now()`, not this injected Clock, so
  // the FixedClock must start after that real timestamp -- otherwise
  // "time since lastUsedAt" would be negative and the touch-interval
  // check in touchLastUsed would never fire in this test.
  const START_TIME = new Date("2030-01-01T00:00:00.000Z");

  beforeAll(async () => {
    clock = new FixedClock(START_TIME);
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        { provide: CLOCK, useValue: clock },
        { provide: ID_GENERATOR, useClass: Uuidv7Generator },
        UsersService,
        AuthService,
        PasswordHasherService,
        TokenService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    auth = moduleRef.get(AuthService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();
    clock.set(START_TIME);
  });

  it("lists only the caller's active sessions and flags the current one", async () => {
    await users.create({ email: "device1@kiosk.test", password: "correct-horse-1" });
    const sessionA = await auth.login("device1@kiosk.test", "correct-horse-1", "Chrome on Mac");
    clock.advanceMs(1000);
    await auth.login("device1@kiosk.test", "correct-horse-1", "Safari on iPhone");

    const validatedA = await auth.validateAccessToken(sessionA.accessToken);
    const list = await auth.listSessions(validatedA.id, validatedA.sessionId);

    expect(list).toHaveLength(2);
    expect(list.filter((session) => session.current)).toHaveLength(1);
    expect(list.find((session) => session.id === validatedA.sessionId)?.current).toBe(true);
    expect(list.map((session) => session.userAgent).sort()).toEqual([
      "Chrome on Mac",
      "Safari on iPhone",
    ]);
  });

  it("excludes a revoked session from the list", async () => {
    await users.create({ email: "device2@kiosk.test", password: "correct-horse-1" });
    const sessionA = await auth.login("device2@kiosk.test", "correct-horse-1");
    const validatedA = await auth.validateAccessToken(sessionA.accessToken);
    const sessionB = await auth.login("device2@kiosk.test", "correct-horse-1");
    const validatedB = await auth.validateAccessToken(sessionB.accessToken);

    await auth.revokeSession(validatedA.id, validatedB.sessionId);

    const list = await auth.listSessions(validatedA.id, validatedA.sessionId);
    expect(list.map((session) => session.id)).toEqual([validatedA.sessionId]);
  });

  it("revoking a session invalidates its access token", async () => {
    await users.create({ email: "device3@kiosk.test", password: "correct-horse-1" });
    const session = await auth.login("device3@kiosk.test", "correct-horse-1");
    const validated = await auth.validateAccessToken(session.accessToken);

    await auth.revokeSession(validated.id, validated.sessionId);

    await expect(auth.validateAccessToken(session.accessToken)).rejects.toBeDefined();
  });

  it("rejects revoking a session that belongs to another user", async () => {
    await users.create({ email: "device4a@kiosk.test", password: "correct-horse-1" });
    const sessionA = await auth.login("device4a@kiosk.test", "correct-horse-1");
    const validatedA = await auth.validateAccessToken(sessionA.accessToken);
    const userB = await users.create({ email: "device4b@kiosk.test", password: "correct-horse-1" });

    await expect(auth.revokeSession(userB.id, validatedA.sessionId)).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
  });

  it("returns the same error for a nonexistent session id (no probing)", async () => {
    const user = await users.create({ email: "device5@kiosk.test", password: "correct-horse-1" });

    await expect(auth.revokeSession(user.id, "does-not-exist")).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
  });

  it("is idempotent when revoking an already-revoked session", async () => {
    await users.create({ email: "device6@kiosk.test", password: "correct-horse-1" });
    const session = await auth.login("device6@kiosk.test", "correct-horse-1");
    const validated = await auth.validateAccessToken(session.accessToken);

    await auth.revokeSession(validated.id, validated.sessionId);

    await expect(auth.revokeSession(validated.id, validated.sessionId)).resolves.toBeUndefined();
  });

  it("throttles lastUsedAt within the touch interval and updates once it elapses", async () => {
    await users.create({ email: "device7@kiosk.test", password: "correct-horse-1" });
    const session = await auth.login("device7@kiosk.test", "correct-horse-1");
    const validated = await auth.validateAccessToken(session.accessToken);
    const afterFirstValidate = await prisma.userSession.findUniqueOrThrow({
      where: { id: validated.sessionId },
    });

    clock.advanceMs(1000);
    await auth.validateAccessToken(session.accessToken);
    const stillThrottled = await prisma.userSession.findUniqueOrThrow({
      where: { id: validated.sessionId },
    });
    expect(stillThrottled.lastUsedAt.getTime()).toBe(afterFirstValidate.lastUsedAt.getTime());

    clock.advanceMs(SESSION_LAST_USED_TOUCH_INTERVAL_MS + 1000);
    await auth.validateAccessToken(session.accessToken);
    const touched = await prisma.userSession.findUniqueOrThrow({
      where: { id: validated.sessionId },
    });
    expect(touched.lastUsedAt.getTime()).toBeGreaterThan(afterFirstValidate.lastUsedAt.getTime());
  });
});
