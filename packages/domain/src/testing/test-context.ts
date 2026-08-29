import { FixedClock } from "./clock";
import { SequentialIdGenerator } from "./id-generator";

/**
 * Shared deterministic test harness: a fixed clock and sequential IDs.
 * Entity-specific test-data factories (added as each domain module is
 * built, starting Phase 1) build on this instead of each test file
 * inventing its own time/identity source.
 */
export interface TestContext {
  clock: FixedClock;
  ids: SequentialIdGenerator;
}

export function createTestContext(initialTime?: Date): TestContext {
  return {
    clock: new FixedClock(initialTime),
    ids: new SequentialIdGenerator(),
  };
}
