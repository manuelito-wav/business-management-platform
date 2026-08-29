import { describe, expect, it } from "vitest";
import { Uuidv4Generator, Uuidv7Generator } from "./id-generator";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Uuidv7Generator", () => {
  it("generates distinct, valid UUIDv7 values", () => {
    const generator = new Uuidv7Generator();
    const first = generator.generate();
    const second = generator.generate();

    expect(first).toMatch(UUID_PATTERN);
    expect(second).toMatch(UUID_PATTERN);
    expect(first).not.toBe(second);
  });

  it("sets the UUID version nibble to 7", () => {
    const id = new Uuidv7Generator().generate();
    expect(id[14]).toBe("7");
  });
});

describe("Uuidv4Generator", () => {
  it("generates distinct, valid UUIDv4 values", () => {
    const generator = new Uuidv4Generator();
    const first = generator.generate();
    const second = generator.generate();

    expect(first).toMatch(UUID_PATTERN);
    expect(first).not.toBe(second);
  });

  it("sets the UUID version nibble to 4", () => {
    const id = new Uuidv4Generator().generate();
    expect(id[14]).toBe("4");
  });
});
