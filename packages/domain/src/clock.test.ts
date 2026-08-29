import { describe, expect, it } from "vitest";
import { SystemClock } from "./clock";

describe("SystemClock", () => {
  it("returns the current wall-clock time", () => {
    const before = Date.now();
    const clock = new SystemClock();
    const now = clock.now();
    const after = Date.now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});
