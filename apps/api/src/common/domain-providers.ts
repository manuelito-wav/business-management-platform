import { SystemClock, Uuidv7Generator } from "@bmp/domain";
import type { Provider } from "@nestjs/common";

/**
 * Injection tokens for the packages/domain time/identity abstractions
 * (see clock.ts / id-generator.ts there). Application code injects
 * these instead of calling `new Date()` or a UUID library directly, so
 * tests can substitute the deterministic doubles from
 * @bmp/domain/testing.
 */
export const CLOCK = Symbol("CLOCK");
export const ID_GENERATOR = Symbol("ID_GENERATOR");

export const domainProviders: Provider[] = [
  { provide: CLOCK, useClass: SystemClock },
  { provide: ID_GENERATOR, useClass: Uuidv7Generator },
];
