import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { rollupComputations } from "./aggregate";
import { daysBetween } from "./dates";
import {
  calculateLoan,
  calculateSimpleInterest,
  previewRepayment,
  type LedgerTransaction,
} from "./interest";
import { formatINR, formatPercent, roundMoney } from "./money";

function given(
  partial: Partial<LedgerTransaction> & Pick<LedgerTransaction, "id" | "transactionDate" | "amount">,
): LedgerTransaction {
  return {
    transactionType: "LOAN_GIVEN",
    paymentType: null,
    principalAmount: partial.amount,
    interestAmount: "0",
    notes: null,
    ...partial,
  };
}

function repay(
  partial: Partial<LedgerTransaction> &
    Pick<LedgerTransaction, "id" | "transactionDate" | "amount">,
): LedgerTransaction {
  return {
    transactionType: "REPAYMENT",
    paymentType: "PRINCIPAL",
    principalAmount: partial.amount,
    interestAmount: "0",
    notes: null,
    ...partial,
  };
}

function interestOf(
  principal: string,
  monthlyRate: string,
  days: number,
  dayCount = 365,
): Decimal {
  return new Decimal(principal)
    .mul(new Decimal(monthlyRate).mul(12))
    .div(100)
    .mul(days)
    .div(dayCount);
}

describe("calculateSimpleInterest", () => {
  it("uses monthly rate × 12 and a single period day count", () => {
    expect(daysBetween("2026-06-01", "2026-08-03")).toBe(63);
    const result = calculateSimpleInterest("100", "1", "2026-06-01", "2026-08-03");
    expect(result.days).toBe(63);
    expect(result.annualRate.eq(12)).toBe(true);
    expect(result.interest.eq(interestOf("100", "1", 63))).toBe(true);
  });

  it("returns zero when the end is not after the start", () => {
    const result = calculateSimpleInterest("100", "1", "2026-06-01", "2026-06-01");
    expect(result.days).toBe(0);
    expect(result.interest.isZero()).toBe(true);
  });

  it("honours a custom day-count basis", () => {
    const result = calculateSimpleInterest("100", "1", "2026-01-01", "2026-01-11", 366);
    expect(result.days).toBe(10);
    expect(result.interest.eq(interestOf("100", "1", 10, 366))).toBe(true);
    expect(result.interest.eq(interestOf("100", "1", 10, 365))).toBe(false);
  });
});

describe("loan ledger", () => {
  const partyA = [
    given({
      id: "a-given",
      transactionDate: "2026-06-01",
      amount: "100",
      notes: "Initial loan",
    }),
    repay({
      id: "a-repay",
      transactionDate: "2026-08-03",
      amount: "50",
      notes: "Partial repayment",
    }),
  ];

  it("charges the full principal when nothing has been repaid", () => {
    const result = calculateLoan({
      monthlyInterestRate: "2",
      startDate: "2026-06-07",
      asOfDate: "2026-09-26",
      transactions: [
        given({ id: "b", transactionDate: "2026-06-07", amount: "200" }),
      ],
    });
    const days = daysBetween("2026-06-07", "2026-09-27");
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]?.days).toBe(days);
    expect(result.outstandingPrincipal).toBe("200");
    expect(result.principalReceived).toBe("0");
    expect(new Decimal(result.accruedInterest).eq(interestOf("200", "2", days))).toBe(true);
    expect(new Decimal(result.totalDue).eq(new Decimal(200).plus(result.accruedInterest))).toBe(true);
  });

  it("splits Party A around the partial repayment and stops interest on the returned ₹50", () => {
    const asOf = "2026-09-26";
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: asOf,
      transactions: partyA,
    });

    expect(result.valid).toBe(true);
    expect(result.principalGiven).toBe("100");
    expect(result.principalReceived).toBe("50");
    expect(result.outstandingPrincipal).toBe("50");
    expect(result.periods).toHaveLength(2);

    const [first, second] = result.periods;
    expect(first?.from).toBe("2026-06-01");
    expect(first?.to).toBe("2026-08-03");
    expect(first?.toInclusive).toBe(false);
    expect(first?.endExclusive).toBe("2026-08-03");
    expect(first?.days).toBe(63);
    expect(first?.principal).toBe("100");
    expect(new Decimal(first!.interest).eq(interestOf("100", "1", 63))).toBe(true);

    expect(second?.from).toBe("2026-08-03");
    expect(second?.to).toBe(asOf);
    expect(second?.toInclusive).toBe(true);
    expect(second?.endExclusive).toBe("2026-09-27");
    expect(second?.days).toBe(55);
    expect(second?.principal).toBe("50");
    expect(new Decimal(second!.interest).eq(interestOf("50", "1", 55))).toBe(true);

    const accrued = new Decimal(first!.interest).plus(second!.interest);
    expect(new Decimal(result.accruedInterest).eq(accrued)).toBe(true);

    const unbrokenDays = daysBetween("2026-06-01", "2026-09-27");
    expect(unbrokenDays).toBe(63 + 55);
    const chargedAsIfNoRepayment = interestOf("100", "1", unbrokenDays);
    const notChargedOnReturnedPrincipal = interestOf("50", "1", 55);
    expect(
      chargedAsIfNoRepayment
        .minus(accrued)
        .toDecimalPlaces(10)
        .eq(notChargedOnReturnedPrincipal.toDecimalPlaces(10)),
    ).toBe(true);

    expect(formatINR(first!.interest)).toBe("₹2.07");
    expect(formatINR(second!.interest)).toBe("₹0.90");
    expect(formatINR(result.accruedInterest)).toBe("₹2.98");
    expect(formatINR(result.outstandingPrincipal)).toBe("₹50.00");
    expect(formatINR(result.totalDue)).toBe("₹52.98");
    expect(result.rows.map((row) => row.principalBalance)).toEqual(["100", "50"]);
  });

  it("creates a new period for every partial repayment", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      asOfDate: "2026-01-31",
      transactions: [
        given({ id: "g", transactionDate: "2026-01-01", amount: "100" }),
        repay({ id: "r1", transactionDate: "2026-01-11", amount: "50" }),
        repay({ id: "r2", transactionDate: "2026-01-21", amount: "20" }),
      ],
    });
    expect(result.periods.map((period) => [period.days, period.principal])).toEqual([
      [10, "100"],
      [10, "50"],
      [11, "30"],
    ]);
    expect(result.outstandingPrincipal).toBe("30");
    expect(result.principalReceived).toBe("70");
    const expected = interestOf("100", "1", 10)
      .plus(interestOf("50", "1", 10))
      .plus(interestOf("30", "1", 11));
    expect(new Decimal(result.accruedInterest).eq(expected)).toBe(true);
    expect(new Decimal(result.totalDue).eq(new Decimal(30).plus(expected))).toBe(true);
  });

  it("stops interest after a full repayment", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      asOfDate: "2026-02-15",
      transactions: [
        given({ id: "g", transactionDate: "2026-01-01", amount: "100" }),
        repay({ id: "r", transactionDate: "2026-01-31", amount: "100" }),
      ],
    });
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]?.days).toBe(30);
    expect(result.periods[0]?.principal).toBe("100");
    expect(result.outstandingPrincipal).toBe("0");
    expect(result.principalReceived).toBe("100");
    expect(new Decimal(result.accruedInterest).eq(interestOf("100", "1", 30))).toBe(true);
    expect(new Decimal(result.totalDue).eq(result.accruedInterest)).toBe(true);
  });

  it("splits a second disbursement on the same account onto its own principal", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-06-20",
      transactions: [
        given({ id: "g1", transactionDate: "2026-06-01", amount: "100" }),
        given({ id: "g2", transactionDate: "2026-06-11", amount: "500" }),
      ],
    });
    expect(result.periods.map((period) => [period.days, period.principal])).toEqual([
      [10, "100"],
      [10, "600"],
    ]);
    expect(result.principalGiven).toBe("600");
    expect(result.outstandingPrincipal).toBe("600");
  });

  it("combines several loans for one party without mixing their rates", () => {
    const first = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-07-20",
      transactions: [given({ id: "a", transactionDate: "2026-06-01", amount: "100" })],
    });
    const second = calculateLoan({
      monthlyInterestRate: "1.5",
      startDate: "2026-07-15",
      asOfDate: "2026-07-20",
      transactions: [given({ id: "b", transactionDate: "2026-07-15", amount: "500" })],
    });
    expect(first.annualRate).toBe("12");
    expect(second.annualRate).toBe("18");
    expect(first.periods[0]?.days).toBe(daysBetween("2026-06-01", "2026-07-21"));
    expect(second.periods[0]?.days).toBe(6);
    const totals = rollupComputations([first, second]);
    expect(totals.principalGiven).toBe("600");
    expect(totals.outstandingPrincipal).toBe("600");
    expect(
      new Decimal(totals.accruedInterest).eq(
        new Decimal(first.accruedInterest).plus(second.accruedInterest),
      ),
    ).toBe(true);
    expect(new Decimal(first.accruedInterest).eq(interestOf("500", "1.5", first.periods[0]!.days))).toBe(false);
  });

  it("counts 29 February and still divides by 365", () => {
    const leap = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2024-02-28",
      asOfDate: "2024-03-01",
      transactions: [given({ id: "g", transactionDate: "2024-02-28", amount: "100" })],
    });
    expect(leap.periods[0]?.days).toBe(3);
    expect(new Decimal(leap.accruedInterest).eq(interestOf("100", "1", 3, 365))).toBe(true);
    expect(new Decimal(leap.accruedInterest).eq(interestOf("100", "1", 3, 366))).toBe(false);

    const common = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2025-02-28",
      asOfDate: "2025-03-01",
      transactions: [given({ id: "g", transactionDate: "2025-02-28", amount: "100" })],
    });
    expect(common.periods[0]?.days).toBe(2);
  });

  it("charges nothing when the monthly rate is zero", () => {
    const result = calculateLoan({
      monthlyInterestRate: "0",
      startDate: "2026-01-01",
      asOfDate: "2026-04-01",
      transactions: [given({ id: "g", transactionDate: "2026-01-01", amount: "100" })],
    });
    expect(result.accruedInterest).toBe("0");
    expect(result.outstandingPrincipal).toBe("100");
    expect(result.totalDue).toBe("100");
    expect(result.periods[0]?.days).toBeGreaterThan(0);
  });

  it("ignores repayments that fall after the selected date", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-07-01",
      transactions: partyA,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.outstandingPrincipal).toBe("100");
    expect(result.principalReceived).toBe("0");
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]?.days).toBe(31);
    expect(new Decimal(result.accruedInterest).eq(interestOf("100", "1", 31))).toBe(true);
  });

  it("charges the repayment date on the reduced principal when money is returned the same day", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-06-01",
      transactions: [
        given({ id: "g", transactionDate: "2026-06-01", amount: "100" }),
        repay({ id: "r", transactionDate: "2026-06-01", amount: "40" }),
      ],
    });
    expect(result.outstandingPrincipal).toBe("60");
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]?.days).toBe(1);
    expect(result.periods[0]?.principal).toBe("60");
    expect(new Decimal(result.accruedInterest).eq(interestOf("60", "1", 1))).toBe(true);
  });

  it("charges no interest when the whole amount is returned the same day", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-06-10",
      transactions: [
        given({ id: "g", transactionDate: "2026-06-01", amount: "100" }),
        repay({ id: "r", transactionDate: "2026-06-01", amount: "100" }),
      ],
    });
    expect(result.outstandingPrincipal).toBe("0");
    expect(result.accruedInterest).toBe("0");
    expect(result.periods).toHaveLength(0);
    expect(result.totalDue).toBe("0");
  });

  it("includes the start date when the calculation date is that same day", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-06-01",
      transactions: [given({ id: "g", transactionDate: "2026-06-01", amount: "100" })],
    });
    expect(result.periods[0]?.days).toBe(1);
    expect(new Decimal(result.accruedInterest).eq(interestOf("100", "1", 1))).toBe(true);
  });

  it("returns an empty statement when the calculation date is before the loan", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      asOfDate: "2026-05-01",
      transactions: [given({ id: "g", transactionDate: "2026-06-01", amount: "100" })],
    });
    expect(result.outstandingPrincipal).toBe("0");
    expect(result.accruedInterest).toBe("0");
    expect(result.periods).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
  });

  it("keeps an interest payment off the principal", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      asOfDate: "2026-01-31",
      transactions: [
        given({ id: "g", transactionDate: "2026-01-01", amount: "100" }),
        {
          id: "i",
          transactionType: "INTEREST_PAYMENT",
          paymentType: "INTEREST",
          amount: "1",
          principalAmount: "0",
          interestAmount: "1",
          transactionDate: "2026-01-15",
        },
      ],
    });
    expect(result.outstandingPrincipal).toBe("100");
    expect(result.interestPaid).toBe("1");
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]?.principal).toBe("100");
    expect(result.periods[0]?.days).toBe(31);
    expect(
      new Decimal(result.netInterest).eq(new Decimal(result.accruedInterest).minus(1)),
    ).toBe(true);
    expect(
      new Decimal(result.totalDue).eq(new Decimal(100).plus(result.netInterest)),
    ).toBe(true);
  });

  it("applies a principal-and-interest receipt only against its principal portion", () => {
    const result = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      asOfDate: "2026-01-31",
      transactions: [
        given({ id: "g", transactionDate: "2026-01-01", amount: "100" }),
        {
          id: "both",
          transactionType: "REPAYMENT",
          paymentType: "BOTH",
          amount: "25",
          principalAmount: "20",
          interestAmount: "5",
          transactionDate: "2026-01-11",
        },
      ],
    });
    expect(result.outstandingPrincipal).toBe("80");
    expect(result.principalReceived).toBe("20");
    expect(result.interestPaid).toBe("5");
    expect(result.periods.map((period) => period.principal)).toEqual(["100", "80"]);
  });
});

describe("repayment guards", () => {
  const transactions = [
    given({ id: "g", transactionDate: "2026-01-01", amount: "100" }),
  ];

  it("rejects a principal repayment greater than the outstanding principal", () => {
    const preview = previewRepayment({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      transactions,
      repaymentDate: "2026-02-01",
      principalAmount: "150",
      interestAmount: "0",
      valuationDate: "2026-02-01",
    });
    expect(preview.ok).toBe(false);
    expect(preview.message).toMatch(/exceeds outstanding principal|more than the outstanding principal/i);
    expect(preview.outstandingBefore).toBe("100");
    expect(preview.outstandingAfter).toBe("100");

    const forced = calculateLoan({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      asOfDate: "2026-02-01",
      transactions: [
        ...transactions,
        repay({ id: "too-much", transactionDate: "2026-02-01", amount: "150" }),
      ],
    });
    expect(forced.valid).toBe(false);
    expect(forced.outstandingPrincipal).toBe("100");
    expect(forced.principalReceived).toBe("0");
  });

  it("rejects a backdated repayment that would make a later receipt too large", () => {
    const preview = previewRepayment({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      transactions: [
        ...transactions,
        repay({ id: "later", transactionDate: "2026-01-20", amount: "80" }),
      ],
      repaymentDate: "2026-01-10",
      principalAmount: "50",
      interestAmount: "0",
      valuationDate: "2026-01-31",
    });
    expect(preview.ok).toBe(false);
    expect(preview.message).toMatch(/exceeds outstanding principal/i);
  });

  it("rejects a repayment dated before the money was given", () => {
    const preview = previewRepayment({
      monthlyInterestRate: "1",
      startDate: "2026-06-01",
      transactions,
      repaymentDate: "2026-05-01",
      principalAmount: "10",
      interestAmount: "0",
      valuationDate: "2026-06-01",
    });
    expect(preview.ok).toBe(false);
    expect(preview.message).toMatch(/before the date money was given/i);
  });

  it("accepts a principal repayment that exactly clears the balance", () => {
    const preview = previewRepayment({
      monthlyInterestRate: "1",
      startDate: "2026-01-01",
      transactions,
      repaymentDate: "2026-01-31",
      principalAmount: "100",
      interestAmount: "0",
      valuationDate: "2026-02-15",
    });
    expect(preview.ok).toBe(true);
    expect(preview.outstandingBefore).toBe("100");
    expect(preview.outstandingAfter).toBe("0");
  });
});

describe("display rounding", () => {
  it("rounds half up to paise and groups digits the Indian way", () => {
    expect(formatINR("100000")).toBe("₹1,00,000.00");
    expect(formatINR("100")).toBe("₹100.00");
    expect(formatINR("123.456")).toBe("₹123.46");
    expect(formatINR("1.005")).toBe("₹1.01");
    expect(formatINR("-50")).toBe("-₹50.00");
    expect(roundMoney("2.9753424657534247").toFixed(2)).toBe("2.98");
    expect(formatPercent("1")).toBe("1%");
    expect(formatPercent("1.75")).toBe("1.75%");
    expect(formatPercent("12")).toBe("12%");
    expect(formatPercent("21")).toBe("21%");
  });
});
