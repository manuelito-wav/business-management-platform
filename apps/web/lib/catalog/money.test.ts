import { describe, expect, it } from "vitest";
import {
  formatMinorUnitsAsMoneyInput,
  formatMoney,
  parseMoneyToMinorUnits,
  parseValidatedMoney,
} from "./money";

describe("parseMoneyToMinorUnits", () => {
  it("parses a dot-decimal pesos string into integer cents", () => {
    expect(parseMoneyToMinorUnits("150.50")).toBe(15050);
  });

  it("parses the es-AR comma-decimal habit the same way", () => {
    expect(parseMoneyToMinorUnits("150,50")).toBe(15050);
  });

  it("accepts a bare integer", () => {
    expect(parseMoneyToMinorUnits("100")).toBe(10000);
  });

  it("accepts zero", () => {
    expect(parseMoneyToMinorUnits("0")).toBe(0);
  });

  it("rejects a negative amount (D-005/isValidMoneyAmount)", () => {
    expect(parseMoneyToMinorUnits("-5")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseMoneyToMinorUnits("abc")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseMoneyToMinorUnits("  ")).toBeNull();
  });
});

describe("formatMinorUnitsAsMoneyInput / parseMoneyToMinorUnits round trip", () => {
  it("round-trips through the input formatter", () => {
    expect(formatMinorUnitsAsMoneyInput(15050)).toBe("150.50");
    expect(parseMoneyToMinorUnits(formatMinorUnitsAsMoneyInput(15050))).toBe(15050);
  });
});

describe("formatMoney", () => {
  it("formats integer cents as an ARS currency string", () => {
    // Intl output uses a non-breaking space before the symbol in es-AR --
    // assert on the digits rather than the exact separator characters.
    expect(formatMoney(15050)).toContain("150,50");
  });
});

describe("parseValidatedMoney", () => {
  it("returns the parsed minor units for an already-valid string", () => {
    expect(parseValidatedMoney("42.00")).toBe(4200);
  });

  it("throws for an invalid string instead of silently coercing it", () => {
    expect(() => parseValidatedMoney("not-a-number")).toThrow();
  });
});
