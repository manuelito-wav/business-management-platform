import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { TokenService } from "./token.service";

describe("TokenService", () => {
  it("issues distinct, high-entropy tokens with a matching hash", () => {
    const tokens = new TokenService();
    const first = tokens.issue();
    const second = tokens.issue();

    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(second.hash);
    expect(first.hash).toBe(tokens.hash(first.token));
  });

  it("hashes the same token deterministically", () => {
    const tokens = new TokenService();
    const { token, hash } = tokens.issue();

    expect(tokens.hash(token)).toBe(hash);
  });

  it("never leaks the raw token into its own hash", () => {
    const tokens = new TokenService();
    const { token, hash } = tokens.issue();

    expect(hash).not.toContain(token);
  });
});
