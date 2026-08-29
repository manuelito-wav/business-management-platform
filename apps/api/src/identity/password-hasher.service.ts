import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing (the library's default algorithm, verified
 * against its output: hashes start with `$argon2id$`). `Algorithm` is
 * declared as a TS `const enum` in @node-rs/argon2, which is
 * incompatible with this project's `isolatedModules` setting, so the
 * default is relied on explicitly here rather than imported.
 */
@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
