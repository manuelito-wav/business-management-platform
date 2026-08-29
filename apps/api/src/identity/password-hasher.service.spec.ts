import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PasswordHasherService } from "./password-hasher.service";

describe("PasswordHasherService", () => {
  it("produces an argon2id hash", async () => {
    const hasher = new PasswordHasherService();
    const hash = await hasher.hash("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("verifies a matching password", async () => {
    const hasher = new PasswordHasherService();
    const hash = await hasher.hash("correct horse battery staple");

    expect(await hasher.verify(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hasher = new PasswordHasherService();
    const hash = await hasher.hash("correct horse battery staple");

    expect(await hasher.verify(hash, "wrong password")).toBe(false);
  });

  it("never produces the same hash twice for the same password", async () => {
    const hasher = new PasswordHasherService();
    const [first, second] = await Promise.all([
      hasher.hash("same password"),
      hasher.hash("same password"),
    ]);

    expect(first).not.toBe(second);
  });
});
