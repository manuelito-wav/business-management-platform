import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

/**
 * Identifier generator abstraction. Entities that must be creatable
 * offline (D-021) generate their own ID client-side through this
 * interface instead of calling a UUID library directly, so tests can
 * substitute a deterministic double (see ./testing/id-generator.ts).
 */
export interface IdGenerator {
  generate(): string;
}

/**
 * Primary identifier policy (D-033). UUIDv7 is time-ordered, which
 * keeps index locality for append-only fact tables and remains safe to
 * generate on an offline client before an operation reaches the server.
 */
export class Uuidv7Generator implements IdGenerator {
  generate(): string {
    return uuidv7();
  }
}

/**
 * Fallback only, per D-033, for a runtime where UUIDv7 generation is
 * unavailable. Not wired as the default anywhere.
 */
export class Uuidv4Generator implements IdGenerator {
  generate(): string {
    return uuidv4();
  }
}
