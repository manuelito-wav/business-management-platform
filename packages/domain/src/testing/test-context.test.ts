import { describe, expect, it } from "vitest";
import { createTestContext } from "./test-context";

describe("createTestContext", () => {
  it("returns a fixed clock and a sequential id generator", () => {
    const context = createTestContext();

    expect(context.clock.now()).toBeInstanceOf(Date);
    expect(context.ids.generate()).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("accepts an initial time for the clock", () => {
    const target = new Date("2030-01-01T00:00:00.000Z");
    const context = createTestContext(target);

    expect(context.clock.now()).toEqual(target);
  });
});
