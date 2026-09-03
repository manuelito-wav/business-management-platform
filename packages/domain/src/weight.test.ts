import { describe, expect, it } from "vitest";
import {
  assertValidGramQuantity,
  formatGramsAsKilograms,
  GRAMS_PER_KILOGRAM,
  isValidGramQuantity,
  parseKilogramsToGrams,
} from "./weight";

describe("parseKilogramsToGrams", () => {
  it("converts whole kilograms", () => {
    expect(parseKilogramsToGrams("2")).toBe(2000);
  });

  it("converts fractional kilograms with 1-3 decimal digits", () => {
    expect(parseKilogramsToGrams("0.25")).toBe(250);
    expect(parseKilogramsToGrams("1.5")).toBe(1500);
    expect(parseKilogramsToGrams("2.005")).toBe(2005);
  });

  it("is exact for a value that loses precision under naive float multiplication", () => {
    // Number("1.005") * 1000 === 1004.9999999999999 in IEEE 754 doubles --
    // the whole point of parsing digit-by-digit instead of multiplying.
    expect(parseKilogramsToGrams("1.005")).toBe(1005);
    expect(Number("1.005") * GRAMS_PER_KILOGRAM).not.toBe(1005); // documents the pitfall being avoided
  });

  it("allows zero", () => {
    expect(parseKilogramsToGrams("0")).toBe(0);
  });

  it("trims surrounding whitespace", () => {
    expect(parseKilogramsToGrams("  1.250  ")).toBe(1250);
  });

  it("rejects more than 3 fractional digits (a fractional gram)", () => {
    expect(() => parseKilogramsToGrams("1.2345")).toThrow(/Invalid kilogram quantity/);
  });

  it("rejects negative values", () => {
    expect(() => parseKilogramsToGrams("-1")).toThrow(/Invalid kilogram quantity/);
  });

  it("rejects non-numeric input", () => {
    expect(() => parseKilogramsToGrams("abc")).toThrow(/Invalid kilogram quantity/);
    expect(() => parseKilogramsToGrams("1.")).toThrow(/Invalid kilogram quantity/);
    expect(() => parseKilogramsToGrams("")).toThrow(/Invalid kilogram quantity/);
  });
});

describe("formatGramsAsKilograms", () => {
  it("formats whole and fractional grams as a 3-decimal kilogram string", () => {
    expect(formatGramsAsKilograms(2000)).toBe("2.000");
    expect(formatGramsAsKilograms(250)).toBe("0.250");
    expect(formatGramsAsKilograms(2005)).toBe("2.005");
    expect(formatGramsAsKilograms(0)).toBe("0.000");
  });

  it("round-trips with parseKilogramsToGrams", () => {
    for (const grams of [0, 1, 999, 1000, 1500, 2005, 123456]) {
      expect(parseKilogramsToGrams(formatGramsAsKilograms(grams))).toBe(grams);
    }
  });

  it("rejects a non-integer or negative gram value", () => {
    expect(() => formatGramsAsKilograms(1.5)).toThrow(/Invalid gram quantity/);
    expect(() => formatGramsAsKilograms(-1)).toThrow(/Invalid gram quantity/);
  });
});

describe("isValidGramQuantity / assertValidGramQuantity", () => {
  it("accepts non-negative integers only", () => {
    expect(isValidGramQuantity(0)).toBe(true);
    expect(isValidGramQuantity(500)).toBe(true);
    expect(isValidGramQuantity(-1)).toBe(false);
    expect(isValidGramQuantity(1.5)).toBe(false);
    expect(isValidGramQuantity("500")).toBe(false);
    expect(isValidGramQuantity(undefined)).toBe(false);
  });

  it("assertValidGramQuantity throws for the same invalid inputs it rejects", () => {
    expect(() => assertValidGramQuantity(-1)).toThrow(/Invalid gram quantity/);
    expect(() => assertValidGramQuantity(1.5)).toThrow(/Invalid gram quantity/);
    expect(() => assertValidGramQuantity(500)).not.toThrow();
  });
});
