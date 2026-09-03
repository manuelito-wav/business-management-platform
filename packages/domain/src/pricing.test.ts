import { describe, expect, it } from "vitest";
import {
  assertValidMoneyAmount,
  isValidMoneyAmount,
  resolvePricing,
  salePriceForTargetMarginPercent,
  salePriceForTargetProfit,
} from "./pricing";

describe("resolvePricing", () => {
  it("matches the roadmap's cost $50 / sale $100 example (profit $50, Margin % 100)", () => {
    const resolved = resolvePricing(5000, 10000);
    expect(resolved.profit).toBe(5000);
    expect(resolved.marginPercentBasisPoints).toBe(10000); // 100.00%
  });

  it("matches the roadmap's cost $50 / sale $75 example (profit $25, Margin % 50)", () => {
    const resolved = resolvePricing(5000, 7500);
    expect(resolved.profit).toBe(2500);
    expect(resolved.marginPercentBasisPoints).toBe(5000); // 50.00%
  });

  it("matches SPECS.md 7.4's cost $3,000 / sale $4,500 example (profit $1,500, Margin 50%)", () => {
    const resolved = resolvePricing(300000, 450000);
    expect(resolved.profit).toBe(150000);
    expect(resolved.marginPercentBasisPoints).toBe(5000);
  });

  it("returns a null Margin % when costPrice is 0, never zero (D-032)", () => {
    const resolved = resolvePricing(0, 500);
    expect(resolved.profit).toBe(500);
    expect(resolved.marginPercentBasisPoints).toBeNull();
  });

  it("computes a negative Margin % for a sale below cost (a loss)", () => {
    const resolved = resolvePricing(1000, 800);
    expect(resolved.profit).toBe(-200);
    expect(resolved.marginPercentBasisPoints).toBe(-2000); // -20.00%
  });

  it("rounds a non-terminating Margin % half-up to the nearest basis point", () => {
    // profit 1 / cost 3 = 33.333...% -> nearest basis point is 33.33%.
    expect(resolvePricing(3, 4).marginPercentBasisPoints).toBe(3333);
    // profit 1 / cost 6 = 16.666...% -> nearest basis point is 16.67%.
    expect(resolvePricing(6, 7).marginPercentBasisPoints).toBe(1667);
  });

  it("computes profit as exact integer subtraction, never rounded", () => {
    const cases = [
      { cost: 0, sale: 0 },
      { cost: 1, sale: 1 },
      { cost: 999, sale: 1000 },
      { cost: 123456, sale: 654321 },
    ];
    for (const { cost, sale } of cases) {
      expect(resolvePricing(cost, sale).profit).toBe(sale - cost);
    }
  });

  it("rejects a non-integer, negative, or non-numeric costPrice/salePrice", () => {
    expect(() => resolvePricing(-1, 100)).toThrow(/Invalid costPrice/);
    expect(() => resolvePricing(1.5, 100)).toThrow(/Invalid costPrice/);
    expect(() => resolvePricing(100, -1)).toThrow(/Invalid salePrice/);
    expect(() => resolvePricing(100, 1.5)).toThrow(/Invalid salePrice/);
  });
});

describe("salePriceForTargetProfit", () => {
  it("adds the target profit to cost (exact, no rounding)", () => {
    expect(salePriceForTargetProfit(5000, 2500)).toBe(7500);
  });

  it("allows a negative target profit (a deliberate loss) that still yields a valid sale price", () => {
    expect(salePriceForTargetProfit(1000, -200)).toBe(800);
  });

  it("stays available while costPrice is 0 (D-032: profit-target mode remains available)", () => {
    expect(salePriceForTargetProfit(0, 500)).toBe(500);
  });

  it("does not itself reject a target profit that would produce a negative sale price -- callers validate the result", () => {
    const salePrice = salePriceForTargetProfit(100, -500);
    expect(salePrice).toBe(-400);
    expect(isValidMoneyAmount(salePrice)).toBe(false);
  });

  it("rejects a non-integer target profit", () => {
    expect(() => salePriceForTargetProfit(100, 1.5)).toThrow(/Invalid target profit/);
  });
});

describe("salePriceForTargetMarginPercent", () => {
  it("is the exact inverse of resolvePricing for a Margin % with no rounding remainder", () => {
    const salePrice = salePriceForTargetMarginPercent(5000, 10000); // target 100.00%
    expect(salePrice).toBe(10000);
    expect(resolvePricing(5000, salePrice).marginPercentBasisPoints).toBe(10000);
  });

  it("rounds an exact-half-basis-point target away from zero (deterministic tie-breaking)", () => {
    // cost 1, target 50.00% -> exact target profit is 0.5 minor units.
    expect(salePriceForTargetMarginPercent(1, 5000)).toBe(1 + 1); // rounds 0.5 up to 1
    expect(salePriceForTargetMarginPercent(1, -5000)).toBe(1 - 1); // rounds -0.5 to -1
  });

  it("re-deriving Margin % from the rounded sale price stays internally consistent", () => {
    // cost 3, target 33.33% cannot be hit exactly in whole minor units;
    // the resolved salePrice's own Margin % must match itself exactly,
    // even if it differs from the original request by a fraction of a bp.
    const salePrice = salePriceForTargetMarginPercent(3, 3333);
    const resolved = resolvePricing(3, salePrice);
    expect(resolved.marginPercentBasisPoints).not.toBeNull();
    expect(resolved.salePrice).toBe(salePrice);
  });

  it("is rejected while costPrice is 0 (D-032: Margin %-target mode is disabled there)", () => {
    expect(() => salePriceForTargetMarginPercent(0, 5000)).toThrow(/D-032/);
  });

  it("rejects a non-integer target Margin %", () => {
    expect(() => salePriceForTargetMarginPercent(100, 33.5)).toThrow(/Invalid target Margin %/);
  });
});

describe("isValidMoneyAmount / assertValidMoneyAmount", () => {
  it("accepts non-negative integers only", () => {
    expect(isValidMoneyAmount(0)).toBe(true);
    expect(isValidMoneyAmount(500)).toBe(true);
    expect(isValidMoneyAmount(-1)).toBe(false);
    expect(isValidMoneyAmount(1.5)).toBe(false);
    expect(isValidMoneyAmount("500")).toBe(false);
    expect(isValidMoneyAmount(undefined)).toBe(false);
  });

  it("assertValidMoneyAmount throws with the given label for the same invalid inputs it rejects", () => {
    expect(() => assertValidMoneyAmount(-1, "costPrice")).toThrow(/Invalid costPrice/);
    expect(() => assertValidMoneyAmount(1.5, "salePrice")).toThrow(/Invalid salePrice/);
    expect(() => assertValidMoneyAmount(500, "costPrice")).not.toThrow();
  });
});
