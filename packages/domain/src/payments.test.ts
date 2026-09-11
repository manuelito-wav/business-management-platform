import { describe, expect, it } from "vitest";
import { resolvePaymentAllocation, type PaymentAllocationInput } from "./payments";

const VERIFIED = new Date("2026-01-01T00:00:00.000Z");

function payment(overrides: Partial<PaymentAllocationInput>): PaymentAllocationInput {
  return { method: "cash", amount: 0, verifiedAt: VERIFIED, ...overrides };
}

describe("resolvePaymentAllocation", () => {
  it("is satisfied by a single exact cash payment, with no change due", () => {
    const result = resolvePaymentAllocation(10000, [payment({ method: "cash", amount: 10000 })]);
    expect(result).toEqual({ satisfied: true, changeDue: 0, totalTendered: 10000 });
  });

  it("matches ROADMAP's own split example: cash $4,000 + card $6,000 on a $10,000 total", () => {
    const result = resolvePaymentAllocation(10000, [
      payment({ method: "cash", amount: 4000 }),
      payment({ method: "card", amount: 6000 }),
    ]);
    expect(result).toEqual({ satisfied: true, changeDue: 0, totalTendered: 10000 });
  });

  it("computes change due when cash tendered exceeds what remains after other methods", () => {
    // $9,700 total, card $5,000 leaves $4,700 owed; cash $5,000 tendered -> $300 change.
    const result = resolvePaymentAllocation(9700, [
      payment({ method: "card", amount: 5000 }),
      payment({ method: "cash", amount: 5000 }),
    ]);
    expect(result).toEqual({ satisfied: true, changeDue: 300, totalTendered: 10000 });
  });

  it("is not satisfied while the total is not yet fully covered", () => {
    const result = resolvePaymentAllocation(10000, [payment({ method: "cash", amount: 6000 })]);
    expect(result.satisfied).toBe(false);
    expect(result.changeDue).toBe(0);
  });

  it("rejects a non-cash allocation that exceeds the total, even if it would otherwise sum correctly", () => {
    // Card $10,500 alone already exceeds a $10,000 total -- not a valid
    // "overpayment producing change" the way cash is.
    const result = resolvePaymentAllocation(10000, [payment({ method: "card", amount: 10500 })]);
    expect(result.satisfied).toBe(false);
    expect(result.changeDue).toBe(0);
  });

  it("is not satisfied while any payment (qr/transfer) is still unverified", () => {
    const result = resolvePaymentAllocation(10000, [
      payment({ method: "qr", amount: 10000, verifiedAt: null }),
    ]);
    expect(result.satisfied).toBe(false);
  });

  it("is satisfied once a previously-unverified qr payment is verified", () => {
    const result = resolvePaymentAllocation(10000, [
      payment({ method: "qr", amount: 10000, verifiedAt: VERIFIED }),
    ]);
    expect(result.satisfied).toBe(true);
  });

  it("treats no payments at all as unsatisfied with zero tendered", () => {
    const result = resolvePaymentAllocation(10000, []);
    expect(result).toEqual({ satisfied: false, changeDue: 0, totalTendered: 0 });
  });

  it("handles multiple cash lines by summing them", () => {
    const result = resolvePaymentAllocation(5000, [
      payment({ method: "cash", amount: 2000 }),
      payment({ method: "cash", amount: 3500 }),
    ]);
    expect(result).toEqual({ satisfied: true, changeDue: 500, totalTendered: 5500 });
  });
});
