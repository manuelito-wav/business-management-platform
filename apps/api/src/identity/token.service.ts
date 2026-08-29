import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

export interface IssuedToken {
  /** Raw token returned to the client once. Never persisted. */
  token: string;
  /** SHA-256 hash persisted in the database. */
  hash: string;
}

const TOKEN_BYTES = 32;

/**
 * Opaque bearer tokens (access, refresh, password-reset) -- random,
 * high-entropy strings hashed with a fast cryptographic hash before
 * storage. Unlike password hashing, these have no brute-force risk to
 * defend against (256 bits of randomness), so a slow adaptive hash
 * like argon2 would only add cost with no security benefit; SHA-256 is
 * the appropriate tool here.
 */
@Injectable()
export class TokenService {
  issue(): IssuedToken {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
