import Decimal from "decimal.js";
import { addDays, compareISO, daysBetween } from "./dates";
import { annualRateFromMonthly, exact, formatINR, formatPercent } from "./money";

/**
 * Day-wise simple interest.
 *
 * Convention
 * ----------
 * Monthly rates are converted once: annualRate = monthlyRate × 12.
 * Interest for one uninterrupted principal balance is:
 *
 *   principal × (annualRate / 100) × (numberOfDays / dayCountBasis)
 *
 * numberOfDays is the calendar difference from the period start (inclusive)
 * to the period end (exclusive). The whole period is calculated in one
 * decimal expression. Days are not rounded individually, and a leap day counts
 * in the numerator. The divisor stays on the configured basis (default 365)
 * even in a leap year.
 *
 * A repayment — or any other principal change — on date R closes the previous
 * period at R. That date is not charged on the old principal. From R onward,
 * including R itself, interest uses the new principal.
 *
 * A statement "as of" date D includes that calendar day. The final open period
 * therefore ends at the exclusive date D + 1.
 *
 * Interest payments do not change principal and do not split a period.
 * Accrued interest is tracked separately from principal. A principal repayment
 * never automatically settles interest.
 */

export const DEFAULT_DAY_COUNT = 365;

export type TransactionType =
  | "LOAN_GIVEN"
  | "REPAYMENT"
  | "INTEREST_PAYMENT"
  | "ADJUSTMENT";

export type PaymentType = "PRINCIPAL" | "INTEREST" | "BOTH";

export interface LedgerTransaction {
  id: string;
  transactionType: TransactionType;
  paymentType: PaymentType | null;
  /** Absolute transaction amount, greater than zero. */
  amount: string;
  /**
   * Principal portion. Positive for money given.
   * Positive for the principal portion of a repayment (it reduces principal).
   * Signed for adjustments: positive increases principal, negative decreases it.
   */
  principalAmount: string;
  /** Interest portion received. Never reduces principal. */
  interestAmount: string;
  transactionDate: string;
  notes?: string | null;
  createdAt?: string;
}

export interface InterestPeriod {
  period: number;
  /** Inclusive start. */
  from: string;
  /**
   * Repayment periods show the repayment date, which is excluded.
   * The final period shows the calculation date, which is included.
   */
  to: string;
  toInclusive: boolean;
  /** Exclusive end used by the day count. */
  endExclusive: string;
  days: number;
  principal: string;
  monthlyRate: string;
  annualRate: string;
  /** Unrounded period interest. */
  interest: string;
  formula: string;
}

export interface LedgerRow {
  id: string;
  date: string;
  transactionType: TransactionType;
  paymentType: PaymentType | null;
  label: string;
  amount: string;
  principalAmount: string;
  interestAmount: string;
  principalBalance: string;
  notes: string | null;
  violation: string | null;
}

export interface LedgerViolation {
  transactionId: string;
  message: string;
}

export interface LoanComputation {
  valid: boolean;
  violations: LedgerViolation[];
  principalGiven: string;
  principalReceived: string;
  interestPaid: string;
  outstandingPrincipal: string;
  /** Gross accrued interest, unrounded. */
  accruedInterest: string;
  /** Accrued interest minus interest payments. May be negative if overpaid. */
  netInterest: string;
  /** Outstanding principal plus net interest, unrounded. */
  totalDue: string;
  periods: InterestPeriod[];
  rows: LedgerRow[];
  lastTransactionDate: string | null;
  monthlyRate: string;
  annualRate: string;
}

export interface CalculateLoanInput {
  monthlyInterestRate: string;
  startDate: string;
  asOfDate: string;
  dayCountBasis?: number;
  transactions: LedgerTransaction[];
}

export interface SimpleInterestResult {
  days: number;
  monthlyRate: Decimal;
  annualRate: Decimal;
  interest: Decimal;
}

const TYPE_RANK: Record<TransactionType, number> = {
  LOAN_GIVEN: 0,
  ADJUSTMENT: 1,
  REPAYMENT: 2,
  INTEREST_PAYMENT: 3,
};

export function calculateSimpleInterest(
  principal: Decimal.Value,
  monthlyRate: Decimal.Value,
  startDate: string,
  endDateExclusive: string,
  dayCountBasis = DEFAULT_DAY_COUNT,
): SimpleInterestResult {
  const balance = new Decimal(principal);
  const monthly = new Decimal(monthlyRate);
  const annual = annualRateFromMonthly(monthly);
  const days =
    compareISO(endDateExclusive, startDate) > 0
      ? daysBetween(startDate, endDateExclusive)
      : 0;
  if (days === 0 || balance.isZero() || annual.isZero() || dayCountBasis <= 0) {
    return {
      days,
      monthlyRate: monthly,
      annualRate: annual,
      interest: new Decimal(0),
    };
  }
  const interest = balance.mul(annual).div(100).mul(days).div(dayCountBasis);
  return { days, monthlyRate: monthly, annualRate: annual, interest };
}

export function transactionLabel(
  type: TransactionType,
  paymentType: PaymentType | null,
): string {
  if (type === "LOAN_GIVEN") return "Money Given";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "INTEREST_PAYMENT" || paymentType === "INTEREST") {
    return "Interest Received";
  }
  if (paymentType === "BOTH") return "Principal & Interest Received";
  return "Principal Received";
}

function sortTransactions(transactions: LedgerTransaction[]): LedgerTransaction[] {
  return [...transactions].sort((a, b) => {
    const byDate = compareISO(a.transactionDate, b.transactionDate);
    if (byDate !== 0) return byDate;
    const byType = TYPE_RANK[a.transactionType] - TYPE_RANK[b.transactionType];
    if (byType !== 0) return byType;
    const aCreated = a.createdAt ?? "";
    const bCreated = b.createdAt ?? "";
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

function trimInterest(value: Decimal): string {
  const fixed = value.toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed(10);
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}

export function calculateLoan(input: CalculateLoanInput): LoanComputation {
  const dayCount = input.dayCountBasis ?? DEFAULT_DAY_COUNT;
  const monthly = new Decimal(input.monthlyInterestRate);
  const annual = annualRateFromMonthly(monthly);
  const asOf = input.asOfDate;
  const finalEnd = addDays(asOf, 1);
  const applicable = sortTransactions(
    input.transactions.filter(
      (txn) => compareISO(txn.transactionDate, asOf) <= 0,
    ),
  );

  let principal = new Decimal(0);
  let principalGiven = new Decimal(0);
  let principalReceived = new Decimal(0);
  let interestPaid = new Decimal(0);
  let periodStart: string | null = null;
  const periods: InterestPeriod[] = [];
  const rows: LedgerRow[] = [];
  const violations: LedgerViolation[] = [];

  const pushPeriod = (from: string, endExclusive: string, balance: Decimal) => {
    if (compareISO(endExclusive, from) <= 0 || balance.lte(0)) return;
    const result = calculateSimpleInterest(
      balance,
      monthly,
      from,
      endExclusive,
      dayCount,
    );
    if (result.days <= 0) return;
    const isFinal = endExclusive === finalEnd;
    periods.push({
      period: periods.length + 1,
      from,
      to: isFinal ? asOf : endExclusive,
      toInclusive: isFinal,
      endExclusive,
      days: result.days,
      principal: exact(balance),
      monthlyRate: exact(monthly),
      annualRate: exact(annual),
      interest: exact(result.interest),
      formula: `${formatINR(balance)} × ${formatPercent(annual)} × ${result.days}/${dayCount} = ${trimInterest(result.interest)}`,
    });
  };

  for (const txn of applicable) {
    const principalBefore = principal;
    let violation: string | null = null;

    if (txn.transactionType === "LOAN_GIVEN") {
      const increase = new Decimal(txn.principalAmount || txn.amount).abs();
      if (increase.gt(0)) {
        if (periodStart && compareISO(txn.transactionDate, periodStart) > 0) {
          pushPeriod(periodStart, txn.transactionDate, principalBefore);
        }
        principal = principal.plus(increase);
        principalGiven = principalGiven.plus(increase);
        periodStart = txn.transactionDate;
      }
    } else if (txn.transactionType === "ADJUSTMENT") {
      const delta = new Decimal(txn.principalAmount || 0);
      if (!delta.isZero()) {
        const next = principal.plus(delta);
        if (next.isNegative()) {
          violation = `Adjustment of ${formatINR(delta)} would take principal below zero on ${txn.transactionDate}. Outstanding principal is ${formatINR(principal)}.`;
          violations.push({ transactionId: txn.id, message: violation });
        } else {
          if (periodStart && compareISO(txn.transactionDate, periodStart) > 0) {
            pushPeriod(periodStart, txn.transactionDate, principalBefore);
          }
          principal = next;
          if (delta.gt(0)) principalGiven = principalGiven.plus(delta);
          else principalReceived = principalReceived.plus(delta.abs());
          periodStart = txn.transactionDate;
        }
      }
    } else {
      const reduce = new Decimal(txn.principalAmount || 0).abs();
      const interestPortion = new Decimal(txn.interestAmount || 0).abs();
      if (reduce.gt(0)) {
        if (reduce.gt(principal)) {
          violation = `Principal repayment of ${formatINR(reduce)} exceeds outstanding principal of ${formatINR(principal)} on ${txn.transactionDate}.`;
          violations.push({ transactionId: txn.id, message: violation });
        } else {
          if (periodStart && compareISO(txn.transactionDate, periodStart) > 0) {
            pushPeriod(periodStart, txn.transactionDate, principalBefore);
          }
          principal = principal.minus(reduce);
          principalReceived = principalReceived.plus(reduce);
          periodStart = txn.transactionDate;
        }
      }
      if (interestPortion.gt(0)) {
        interestPaid = interestPaid.plus(interestPortion);
      }
    }

    rows.push({
      id: txn.id,
      date: txn.transactionDate,
      transactionType: txn.transactionType,
      paymentType: txn.paymentType,
      label: transactionLabel(txn.transactionType, txn.paymentType),
      amount: exact(new Decimal(txn.amount || 0).abs()),
      principalAmount: txn.principalAmount,
      interestAmount: txn.interestAmount,
      principalBalance: exact(principal),
      notes: txn.notes ?? null,
      violation,
    });
  }

  if (
    periodStart &&
    principal.gt(0) &&
    compareISO(finalEnd, periodStart) > 0
  ) {
    pushPeriod(periodStart, finalEnd, principal);
  }

  const accrued = periods.reduce(
    (total, period) => total.plus(period.interest),
    new Decimal(0),
  );
  const net = accrued.minus(interestPaid);
  const dates = applicable.map((txn) => txn.transactionDate);

  return {
    valid: violations.length === 0,
    violations,
    principalGiven: exact(principalGiven),
    principalReceived: exact(principalReceived),
    interestPaid: exact(interestPaid),
    outstandingPrincipal: exact(principal),
    accruedInterest: exact(accrued),
    netInterest: exact(net),
    totalDue: exact(principal.plus(net)),
    periods,
    rows,
    lastTransactionDate: dates.length ? dates[dates.length - 1] : null,
    monthlyRate: exact(monthly),
    annualRate: exact(annual),
  };
}

export interface RepaymentPreview {
  ok: boolean;
  message: string | null;
  outstandingBefore: string;
  outstandingAfter: string;
  repaymentPrincipal: string;
  repaymentInterest: string;
  accruedInterest: string;
  totalDue: string;
}

/**
 * Check a proposed repayment against the ledger.
 * Principal received cannot exceed principal outstanding on that date,
 * and inserting it must not make a later balance negative.
 */
export function previewRepayment(input: {
  monthlyInterestRate: string;
  startDate: string;
  transactions: LedgerTransaction[];
  dayCountBasis?: number;
  repaymentDate: string;
  principalAmount: string;
  interestAmount: string;
  valuationDate: string;
}): RepaymentPreview {
  const principalAmount = new Decimal(input.principalAmount || 0);
  const interestAmount = new Decimal(input.interestAmount || 0);
  const empty: RepaymentPreview = {
    ok: false,
    message: null,
    outstandingBefore: "0",
    outstandingAfter: "0",
    repaymentPrincipal: exact(principalAmount),
    repaymentInterest: exact(interestAmount),
    accruedInterest: "0",
    totalDue: "0",
  };

  if (compareISO(input.repaymentDate, input.startDate) < 0) {
    return {
      ...empty,
      message: "Repayment date cannot be before the date money was given.",
    };
  }

  const before = calculateLoan({
    monthlyInterestRate: input.monthlyInterestRate,
    startDate: input.startDate,
    asOfDate: input.repaymentDate,
    dayCountBasis: input.dayCountBasis,
    transactions: input.transactions,
  });

  if (principalAmount.gt(before.outstandingPrincipal)) {
    return {
      ...empty,
      ok: false,
      message: `Principal repayment of ${formatINR(principalAmount)} is more than the outstanding principal of ${formatINR(before.outstandingPrincipal)}. Record the extra amount as an interest payment, or reduce the principal portion.`,
      outstandingBefore: before.outstandingPrincipal,
      outstandingAfter: before.outstandingPrincipal,
      accruedInterest: before.accruedInterest,
      totalDue: before.totalDue,
    };
  }

  const hypothetical: LedgerTransaction = {
    id: "__preview__",
    transactionType: interestAmount.gt(0) && principalAmount.isZero()
      ? "INTEREST_PAYMENT"
      : "REPAYMENT",
    paymentType: principalAmount.gt(0) && interestAmount.gt(0)
      ? "BOTH"
      : interestAmount.gt(0)
        ? "INTEREST"
        : "PRINCIPAL",
    amount: exact(principalAmount.plus(interestAmount)),
    principalAmount: exact(principalAmount),
    interestAmount: exact(interestAmount),
    transactionDate: input.repaymentDate,
    createdAt: "9999-12-31T00:00:00.000Z",
  };

  const dates = [
    input.valuationDate,
    input.repaymentDate,
    ...input.transactions.map((txn) => txn.transactionDate),
  ].sort();
  const horizon = dates[dates.length - 1] ?? input.repaymentDate;
  const replay = calculateLoan({
    monthlyInterestRate: input.monthlyInterestRate,
    startDate: input.startDate,
    asOfDate: horizon,
    dayCountBasis: input.dayCountBasis,
    transactions: [...input.transactions, hypothetical],
  });

  if (!replay.valid) {
    return {
      ...empty,
      message:
        replay.violations[0]?.message ??
        "This repayment would make a later principal balance negative. Edit the later repayment first.",
      outstandingBefore: before.outstandingPrincipal,
      outstandingAfter: before.outstandingPrincipal,
      accruedInterest: before.accruedInterest,
      totalDue: before.totalDue,
    };
  }

  const valuationAsOf =
    compareISO(input.valuationDate, input.repaymentDate) < 0
      ? input.repaymentDate
      : input.valuationDate;
  const valued = calculateLoan({
    monthlyInterestRate: input.monthlyInterestRate,
    startDate: input.startDate,
    asOfDate: valuationAsOf,
    dayCountBasis: input.dayCountBasis,
    transactions: [...input.transactions, hypothetical],
  });

  return {
    ok: true,
    message: null,
    outstandingBefore: before.outstandingPrincipal,
    outstandingAfter: exact(
      new Decimal(before.outstandingPrincipal).minus(principalAmount),
    ),
    repaymentPrincipal: exact(principalAmount),
    repaymentInterest: exact(interestAmount),
    accruedInterest: valued.accruedInterest,
    totalDue: valued.totalDue,
  };
}

export function fullLedgerAsOf(transactions: LedgerTransaction[], startDate: string): string {
  return transactions.reduce(
    (latest, txn) =>
      compareISO(txn.transactionDate, latest) > 0 ? txn.transactionDate : latest,
    startDate,
  );
}

export function ledgerError(
  input: Omit<CalculateLoanInput, "asOfDate">,
): string | null {
  const asOfDate = fullLedgerAsOf(input.transactions, input.startDate);
  const result = calculateLoan({ ...input, asOfDate });
  if (result.valid) return null;
  return (
    result.violations[0]?.message ??
    "This change would make a principal balance negative."
  );
}

export function deriveLoanStatus(
  input: Omit<CalculateLoanInput, "asOfDate">,
): "ACTIVE" | "CLOSED" {
  const asOfDate = fullLedgerAsOf(input.transactions, input.startDate);
  const result = calculateLoan({ ...input, asOfDate });
  return new Decimal(result.outstandingPrincipal).isZero() ? "CLOSED" : "ACTIVE";
}
