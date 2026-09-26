import { describe, expect, it } from "vitest";
import { addCalendarMonths, daysBetween } from "./dates";
import {
  formatHoldingDuration,
  formatLoanTotalDuration,
  loanHoldingEndExclusive,
  oldestOpenLoanDuration,
  wholeCalendarMonths,
} from "./duration";
import { calculateLoan, type LedgerTransaction } from "./interest";

describe("addCalendarMonths", () => {
  it("clamps a 31st onto the last day of February", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("crosses a year boundary without overflowing the day", () => {
    expect(addCalendarMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("wholeCalendarMonths", () => {
  it("counts an anniversary that lands on the exclusive end as complete", () => {
    expect(wholeCalendarMonths("2026-03-26", "2026-09-26")).toBe(6);
    expect(wholeCalendarMonths("2026-03-26", "2026-09-27")).toBe(6);
    expect(wholeCalendarMonths("2026-06-01", "2026-08-03")).toBe(2);
    expect(wholeCalendarMonths("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("does not count a month until the clamped anniversary", () => {
    expect(wholeCalendarMonths("2026-01-31", "2026-02-28")).toBe(1);
    expect(wholeCalendarMonths("2026-01-31", "2026-02-27")).toBe(0);
    expect(wholeCalendarMonths("2024-01-31", "2024-02-29")).toBe(1);
    expect(wholeCalendarMonths("2024-01-31", "2024-02-28")).toBe(0);
    expect(wholeCalendarMonths("2026-03-26", "2026-03-26")).toBe(0);
  });
});

describe("formatHoldingDuration", () => {
  it("formats a same-day span, one day, and a short week", () => {
    expect(formatHoldingDuration("2026-06-01", "2026-06-01")).toBe("Same day");
    expect(daysBetween("2026-06-01", "2026-06-02")).toBe(1);
    expect(formatHoldingDuration("2026-06-01", "2026-06-02")).toBe("1 day");
    expect(daysBetween("2026-06-01", "2026-06-07")).toBe(6);
    expect(formatHoldingDuration("2026-06-01", "2026-06-07")).toBe("6 days");
    expect(daysBetween("2026-06-01", "2026-06-08")).toBe(7);
    expect(formatHoldingDuration("2026-06-01", "2026-06-08")).toBe("1 week");
    expect(daysBetween("2026-06-01", "2026-06-14")).toBe(13);
    expect(formatHoldingDuration("2026-06-01", "2026-06-14")).toBe("1 week, 6 days");
    expect(formatHoldingDuration("2026-01-01", "2026-01-15")).toBe("2 weeks");
  });

  it("uses calendar months once the anniversary is reached", () => {
    expect(daysBetween("2026-01-15", "2026-02-15")).toBe(31);
    expect(formatHoldingDuration("2026-01-15", "2026-02-15")).toBe("1 month");
    expect(daysBetween("2026-01-15", "2026-02-19")).toBe(35);
    expect(formatHoldingDuration("2026-01-15", "2026-02-19")).toBe("1 month, 4 days");
    expect(formatHoldingDuration("2026-01-15", "2026-02-25")).toBe("1 month, 10 days");
  });

  it("formats the Party A period of 63 days as 2 months and 2 days", () => {
    expect(daysBetween("2026-06-01", "2026-08-03")).toBe(63);
    expect(formatHoldingDuration("2026-06-01", "2026-08-03")).toBe("2 months, 2 days");
  });

  it("formats 26/03/2026 to 26/09/2026 exclusive (184 days) as 6 months", () => {
    expect(daysBetween("2026-03-26", "2026-09-26")).toBe(184);
    expect(formatHoldingDuration("2026-03-26", "2026-09-26")).toBe("6 months");
  });

  it("keeps a 28-day February as one month rather than four weeks", () => {
    expect(daysBetween("2025-02-01", "2025-03-01")).toBe(28);
    expect(formatHoldingDuration("2025-02-01", "2025-03-01")).toBe("1 month");
    expect(formatHoldingDuration("2026-01-01", "2026-01-31")).toBe("4 weeks, 2 days");
  });

  it("counts a leap-day February as one calendar month", () => {
    expect(daysBetween("2024-02-01", "2024-03-01")).toBe(29);
    expect(formatHoldingDuration("2024-02-01", "2024-03-01")).toBe("1 month");
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(formatHoldingDuration("2024-02-28", "2024-03-01")).toBe("2 days");
    expect(wholeCalendarMonths("2024-01-31", "2024-03-01")).toBe(1);
    expect(formatHoldingDuration("2024-01-31", "2024-03-01")).toBe("1 month, 1 day");
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(formatHoldingDuration("2024-02-29", "2025-02-28")).toBe("1 year");
  });

  it("writes years and drops zero months and days", () => {
    expect(formatHoldingDuration("2026-03-26", "2027-03-26")).toBe("1 year");
    expect(formatHoldingDuration("2026-03-26", "2027-03-30")).toBe("1 year, 4 days");
    expect(formatHoldingDuration("2026-03-26", "2027-04-26")).toBe("1 year, 1 month");
    expect(formatHoldingDuration("2026-03-26", "2027-09-30")).toBe(
      "1 year, 6 months, 4 days",
    );
  });

  it("rejects a reversed span as no holding time", () => {
    expect(formatHoldingDuration("2026-06-10", "2026-06-01")).toBe("Same day");
  });
});

describe("loan total duration", () => {
  it("includes the as-of date while principal is outstanding", () => {
    expect(
      loanHoldingEndExclusive({
        startDate: "2026-03-26",
        asOfDate: "2026-09-26",
        outstanding: true,
      }),
    ).toBe("2026-09-27");
    expect(
      formatLoanTotalDuration({
        startDate: "2026-03-26",
        asOfDate: "2026-09-26",
        outstanding: true,
      }),
    ).toBe("6 months, 1 day");
    expect(
      formatLoanTotalDuration({
        startDate: "2026-06-01",
        asOfDate: "2026-06-01",
        outstanding: true,
      }),
    ).toBe("1 day");
  });

  it("stops before the repayment date once principal is zero", () => {
    expect(
      loanHoldingEndExclusive({
        startDate: "2026-03-26",
        asOfDate: "2026-09-26",
        outstanding: false,
        zeroDate: "2026-09-26",
      }),
    ).toBe("2026-09-26");
    expect(
      formatLoanTotalDuration({
        startDate: "2026-03-26",
        asOfDate: "2026-10-01",
        outstanding: false,
        zeroDate: "2026-09-26",
      }),
    ).toBe("6 months");
    expect(
      formatLoanTotalDuration({
        startDate: "2026-06-01",
        asOfDate: "2026-06-10",
        outstanding: false,
        zeroDate: "2026-06-01",
      }),
    ).toBe("Same day");
  });
});

describe("oldest open loan", () => {
  it("uses the earliest loan that still has principal", () => {
    const duration = oldestOpenLoanDuration(
      [
        { startDate: "2026-03-26", outstanding: false },
        { startDate: "2026-06-01", outstanding: true },
        { startDate: "2026-08-01", outstanding: true },
      ],
      "2026-09-26",
    );
    expect(duration?.startDate).toBe("2026-06-01");
    expect(duration?.label).toBe(
      formatLoanTotalDuration({
        startDate: "2026-06-01",
        asOfDate: "2026-09-26",
        outstanding: true,
      }),
    );
    expect(duration?.hint).toBe("Oldest open loan · from 01/06/2026");
    expect(duration?.openCount).toBe(2);
  });

  it("returns nothing when every loan is cleared", () => {
    expect(
      oldestOpenLoanDuration(
        [{ startDate: "2026-03-26", outstanding: false }],
        "2026-09-26",
      ),
    ).toBeNull();
  });
});

describe("interest period durations", () => {
  it("formats each period from its own exclusive end", () => {
    const transactions: LedgerTransaction[] = [
      {
        id: "g",
        transactionType: "LOAN_GIVEN",
        paymentType: null,
        amount: "1000",
        principalAmount: "1000",
        interestAmount: "0",
        transactionDate: "2026-03-26",
      },
      {
        id: "r",
        transactionType: "REPAYMENT",
        paymentType: "PRINCIPAL",
        amount: "850",
        principalAmount: "850",
        interestAmount: "0",
        transactionDate: "2026-09-26",
      },
    ];
    const result = calculateLoan({
      monthlyInterestRate: "1.5",
      startDate: "2026-03-26",
      asOfDate: "2026-09-26",
      transactions,
    });
    expect(result.periods.map((period) => period.days)).toEqual([184, 1]);
    expect(
      result.periods.map((period) =>
        formatHoldingDuration(period.from, period.endExclusive),
      ),
    ).toEqual(["6 months", "1 day"]);
    expect(
      formatHoldingDuration("2026-03-26", "2026-09-26"),
    ).toBe("6 months");
    expect(
      formatLoanTotalDuration({
        startDate: "2026-03-26",
        asOfDate: "2026-09-26",
        outstanding: true,
      }),
    ).toBe("6 months, 1 day");
  });
});
