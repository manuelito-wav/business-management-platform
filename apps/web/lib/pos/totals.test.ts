import { describe, expect, it } from "vitest";
import type { CartLine } from "./cart";
import { computeCartTotal, computeLineTotal } from "./totals";

function unitLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: "prod-1",
    name: "Cola",
    saleMode: "unit",
    weightUnit: null,
    unitPrice: 10000,
    quantity: 1,
    imageUrl: null,
    ...overrides,
  };
}

function weightedLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: "prod-2",
    name: "Jamón",
    saleMode: "weighted",
    weightUnit: "kg",
    unitPrice: 50000, // $500.00/kg
    quantity: 750, // grams
    imageUrl: null,
    ...overrides,
  };
}

describe("computeLineTotal", () => {
  it("multiplies price by quantity for a unit-mode line", () => {
    expect(computeLineTotal(unitLine({ unitPrice: 10000, quantity: 3 }))).toBe(30000);
  });

  it("computes an exact proportional total for a weighted line (price-per-kg * grams / 1000)", () => {
    expect(computeLineTotal(weightedLine({ unitPrice: 50000, quantity: 750 }))).toBe(37500);
  });

  it("returns 0 for a weighted line with no weight entered yet", () => {
    expect(computeLineTotal(weightedLine({ quantity: 0 }))).toBe(0);
  });

  it("returns null when the product has no price set", () => {
    expect(computeLineTotal(unitLine({ unitPrice: null }))).toBeNull();
    expect(computeLineTotal(weightedLine({ unitPrice: null }))).toBeNull();
  });
});

describe("computeCartTotal", () => {
  it("sums every line's total", () => {
    const lines = [
      unitLine({ productId: "a", unitPrice: 10000, quantity: 2 }),
      weightedLine({ productId: "b", unitPrice: 50000, quantity: 750 }),
    ];
    expect(computeCartTotal(lines)).toBe(20000 + 37500);
  });

  it("treats a priceless line as contributing zero, not throwing", () => {
    const lines = [unitLine({ unitPrice: null, quantity: 5 }), unitLine({ unitPrice: 1000 })];
    expect(computeCartTotal(lines)).toBe(1000);
  });

  it("returns 0 for an empty cart", () => {
    expect(computeCartTotal([])).toBe(0);
  });
});
