import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { GlobalExceptionFilter } from "../common/filters/http-exception.filter";
import { validationExceptionFactory } from "../common/validation-exception-factory";
import { PrismaService } from "../prisma/prisma.service";

describe("Session/device management (HTTP)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerAndLogin(email: string): Promise<{ accessToken: string }> {
    await request(app.getHttpServer())
      .post("/users")
      .send({ email, password: "correct-horse-1" })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: email, password: "correct-horse-1" })
      .expect(200);
    return { accessToken: login.body.accessToken as string };
  }

  it("rejects listing sessions without a token", async () => {
    await request(app.getHttpServer()).get("/auth/sessions").expect(401);
  });

  it("lists the caller's own session, flagged as current", async () => {
    const { accessToken } = await registerAndLogin("sessions-http1@kiosk.test");

    const response = await request(app.getHttpServer())
      .get("/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].current).toBe(true);
  });

  it("revokes the caller's own session, which then stops working", async () => {
    const { accessToken } = await registerAndLogin("sessions-http2@kiosk.test");
    const list = await request(app.getHttpServer())
      .get("/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    const sessionId: string = list.body[0].id;

    await request(app.getHttpServer())
      .delete(`/auth/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get("/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
  });

  it("rejects revoking another user's session", async () => {
    const userA = await registerAndLogin("sessions-http3a@kiosk.test");
    const listA = await request(app.getHttpServer())
      .get("/auth/sessions")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
    const sessionIdA: string = listA.body[0].id;

    const userB = await registerAndLogin("sessions-http3b@kiosk.test");
    const denied = await request(app.getHttpServer())
      .delete(`/auth/sessions/${sessionIdA}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);
    expect(denied.body.error.code).toBe("SESSION_NOT_FOUND");

    // Untouched: A's session still works.
    await request(app.getHttpServer())
      .get("/auth/sessions")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
  });
});
