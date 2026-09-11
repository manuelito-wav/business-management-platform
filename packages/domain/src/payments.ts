/**
 * Split-payment allocation (SPECS.md 6.6/10.2: "The employee may split
 * payment across multiple methods... The sale can only complete when the
 * required amount is satisfied according to the payment rules";
 * ROADMAP.md "add split payment settlement": "Validate that payment
 * allocation satisfies the total under explicit rounding and
 * overpayment/change rules"). Pure and framework-independent so the same
 * rule runs identically on the POS charge overlay (showing live change
 * due as the cashier enters amounts) and the backend command that
 * actually settles the sale -- the same "one rule, not two" reasoning
 * apps/api's SalesService already follows for line-total math
 * (roundedIntegerMultiplyDivide).
 */

export type PaymentMethod = "cash" | "qr" | "card" | "transfer";

export interface PaymentAllocationInput {
  method: PaymentMethod;
  /** Integer ARS minor units (D-005). For "cash", the amount actually tendered (may exceed what's owed); for every other method, the exact amount charged -- see this module's own doc comment. */
  amount: number;
  /** SPECS.md 10.3: null until an employee manually confirms a qr/transfer payment actually arrived. Cash and card are self-verifying (always non-null) -- see PaymentAllocationInput's caller for how each method sets this. */
  verifiedAt: Date | null;
}

export interface PaymentAllocationResult {
  /** True once every payment is verified and the total is exactly covered (non-cash methods can never exceed it; cash may, producing change). */
  satisfied: boolean;
  /** Change owed back to the customer from cash tendered beyond what was needed. 0 when there is no overpayment. */
  changeDue: number;
  /** Sum of every payment's amount as entered -- cash counted at its full tendered amount, not net of change. */
  totalTendered: number;
}

/**
 * Resolves one sale's current payment allocation against its total.
 * Only "cash" may exceed the amount it needs to cover (the excess is
 * `changeDue`); every other method is rejected as unsatisfied the moment
 * its own combined total would exceed the sale total, since there is no
 * real-world "change" for a card/QR/transfer overpayment -- that would be
 * a refund, a distinct later concern (ROADMAP.md "add audited
 * cancellations and refunds"), not a settlement-time adjustment.
 */
export function resolvePaymentAllocation(
  saleTotal: number,
  payments: readonly PaymentAllocationInput[],
): PaymentAllocationResult {
  const nonCashTotal = payments
    .filter((payment) => payment.method !== "cash")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const cashTendered = payments
    .filter((payment) => payment.method === "cash")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalTendered = nonCashTotal + cashTendered;
  const allVerified = payments.every((payment) => payment.verifiedAt !== null);

  if (nonCashTotal > saleTotal || !allVerified) {
    return { satisfied: false, changeDue: 0, totalTendered };
  }

  const remainingForCash = saleTotal - nonCashTotal;
  const changeDue = Math.max(0, cashTendered - remainingForCash);
  return { satisfied: cashTendered >= remainingForCash, changeDue, totalTendered };
}
