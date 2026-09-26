import { todayISO, formatDisplayDate } from "../src/lib/finance/dates";
import { calculateLoan } from "../src/lib/finance/interest";
import { formatINR, formatPercent } from "../src/lib/finance/money";

const asOf = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
  ? process.argv[2]
  : todayISO();

const result = calculateLoan({
  monthlyInterestRate: "1",
  startDate: "2026-06-01",
  asOfDate: asOf,
  transactions: [
    {
      id: "given",
      transactionType: "LOAN_GIVEN",
      paymentType: null,
      amount: "100",
      principalAmount: "100",
      interestAmount: "0",
      transactionDate: "2026-06-01",
      notes: "Initial loan",
    },
    {
      id: "repay",
      transactionType: "REPAYMENT",
      paymentType: "PRINCIPAL",
      amount: "50",
      principalAmount: "50",
      interestAmount: "0",
      transactionDate: "2026-08-03",
      notes: "Partial repayment",
    },
  ],
});

const [before, after] = result.periods;
console.log(
  JSON.stringify(
    {
      asOf,
      asOfDisplay: formatDisplayDate(asOf),
      originalPrincipal: formatINR(result.principalGiven),
      principalReturned: formatINR(result.principalReceived),
      outstandingPrincipal: formatINR(result.outstandingPrincipal),
      interestBefore: before
        ? {
            from: formatDisplayDate(before.from),
            to: formatDisplayDate(before.to),
            toInclusive: before.toInclusive,
            days: before.days,
            principal: formatINR(before.principal),
            monthlyRate: formatPercent(before.monthlyRate),
            annualRate: formatPercent(before.annualRate),
            formula: before.formula,
            exact: before.interest,
            display: formatINR(before.interest),
          }
        : null,
      interestAfter: after
        ? {
            from: formatDisplayDate(after.from),
            to: formatDisplayDate(after.to),
            toInclusive: after.toInclusive,
            days: after.days,
            principal: formatINR(after.principal),
            monthlyRate: formatPercent(after.monthlyRate),
            annualRate: formatPercent(after.annualRate),
            formula: after.formula,
            exact: after.interest,
            display: formatINR(after.interest),
          }
        : null,
      totalAccruedExact: result.accruedInterest,
      totalAccrued: formatINR(result.accruedInterest),
      totalDue: formatINR(result.totalDue),
    },
    null,
    2,
  ),
);
