import { afterEach, describe, expect, it } from "vitest";
import { LoggingPasswordResetDelivery } from "./password-reset-delivery";

describe("LoggingPasswordResetDelivery", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("delivers (logs) in development", async () => {
    process.env.NODE_ENV = "development";
    const delivery = new LoggingPasswordResetDelivery();

    await expect(delivery.send("user@kiosk.test", "some-token")).resolves.toBeUndefined();
  });

  it("refuses to run in production", async () => {
    process.env.NODE_ENV = "production";
    const delivery = new LoggingPasswordResetDelivery();

    await expect(delivery.send("user@kiosk.test", "some-token")).rejects.toThrow(
      /must not be used in production/,
    );
  });
});
