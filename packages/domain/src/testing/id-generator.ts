import type { IdGenerator } from "../id-generator";

/**
 * Deterministic IdGenerator test double. Produces sequential,
 * valid-shaped UUIDs (00000000-0000-4000-8000-000000000001, ...) so
 * tests can assert on exact IDs instead of matching a random pattern.
 */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    const suffix = this.counter.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  }

  reset(): void {
    this.counter = 0;
  }
}
