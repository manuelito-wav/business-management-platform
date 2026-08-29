/**
 * Time source abstraction. Domain and application code must read time
 * through this interface instead of calling `new Date()`/`Date.now()`
 * directly, so it can be replaced with a deterministic double in tests
 * (see ./testing/clock.ts). See D-036 for occurredAt/recordedAt/syncedAt
 * semantics that build on this.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
