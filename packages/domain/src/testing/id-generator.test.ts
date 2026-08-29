import { describe, expect, it } from "vitest";
import { SequentialIdGenerator } from "./id-generator";

describe("SequentialIdGenerator", () => {
  it("generates deterministic, sequential, valid-shaped UUIDs", () => {
    const generator = new SequentialIdGenerator();

    expect(generator.generate()).toBe("00000000-0000-4000-8000-000000000001");
    expect(generator.generate()).toBe("00000000-0000-4000-8000-000000000002");
  });

  it("resets the counter", () => {
    const generator = new SequentialIdGenerator();
    generator.generate();
    generator.generate();

    generator.reset();

    expect(generator.generate()).toBe("00000000-0000-4000-8000-000000000001");
  });
});
