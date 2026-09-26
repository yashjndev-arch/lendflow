import {
  addCalendarMonths,
  addDays,
  compareISO,
  daysBetween,
  formatDisplayDate,
  isIsoDate,
} from "./dates";

/**
 * How long the money has been out, written for the ledger.
 *
 * Spans are half-open calendar dates: start inclusive, end exclusive. That is
 * the same day count interest already stores on a period, so 184 days formats
 * as the human length of those 184 days and not 185.
 *
 * Whole months are counted by anniversary. The largest N such that
 * `addCalendarMonths(start, N)` is still on or before the exclusive end is N
 * months. If the start day does not exist in the target month (31 January),
 * the anniversary is the last day of that month. A single step back from the
 * year-month difference is enough, because that estimate never lands more
 * than one month past the anniversary. Days after the anniversary are the
 * remainder. They stay as days once a month is complete ("1 month, 10 days"),
 * so the column remains one phrase. Weeks are used only when the span is
 * shorter than one calendar month.
 *
 * Zero parts are omitted. Nothing is padded with "0 months" or "0 days".
 *
 * Transaction rows use the row date as the exclusive end. A money-given row
 * on the start date is "Same day". A later receipt therefore matches the
 * interest period that ends on that date (the receipt date is not counted).
 *
 * The loan total is different when principal is still outstanding: the as-of
 * date counts, matching interest, so the exclusive end is the day after as-of.
 * When the last principal reduction has brought the balance to zero, the
 * repayment date is the exclusive end. Interest does not charge the old
 * principal on that date, and the money is not still out after the receipt.
 */

export const TRANSACTION_DURATION_HINT =
  "Time this loan's money had been out before this date, from the loan start. This date is not included, so a receipt matches the interest period that ends that day.";

export const PERIOD_DURATION_HINT =
  "Calendar length of this period. Same day count as Days: From is included and the exclusive end is not.";

export const LOAN_DURATION_HINT =
  "While principal is outstanding, the selected date is included. After principal is fully repaid, duration stops at the repayment date and that date is not counted.";

export const DASHBOARD_DURATION_HINT =
  "Longest time an open loan has been out, through the selected date. If several loans are still open, this is the oldest start date, not a blend of them.";

function unit(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * Whole calendar months in [start, endExclusive).
 * See the module comment for the anniversary rule.
 */
export function wholeCalendarMonths(start: string, endExclusive: string): number {
  if (!isIsoDate(start) || !isIsoDate(endExclusive)) {
    throw new Error(`Invalid duration span: ${start} .. ${endExclusive}`);
  }
  if (compareISO(endExclusive, start) <= 0) return 0;
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = endExclusive.split("-").map(Number);
  let months = (endYear - startYear) * 12 + (endMonth - startMonth);
  if (compareISO(addCalendarMonths(start, months), endExclusive) > 0) {
    months -= 1;
  }
  return months;
}

/** Human length of the half-open span [start, endExclusive). */
export function formatHoldingDuration(start: string, endExclusive: string): string {
  if (!isIsoDate(start) || !isIsoDate(endExclusive)) {
    throw new Error(`Invalid duration span: ${start} .. ${endExclusive}`);
  }
  if (compareISO(endExclusive, start) <= 0) return "Same day";

  const months = wholeCalendarMonths(start, endExclusive);
  if (months >= 1) {
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    const leftover = daysBetween(addCalendarMonths(start, months), endExclusive);
    const parts: string[] = [];
    if (years > 0) parts.push(unit(years, "year"));
    if (remMonths > 0) parts.push(unit(remMonths, "month"));
    if (leftover > 0) parts.push(unit(leftover, "day"));
    return parts.join(", ");
  }

  const days = daysBetween(start, endExclusive);
  if (days < 7) return unit(days, "day");
  const weeks = Math.floor(days / 7);
  const remDays = days % 7;
  if (remDays === 0) return unit(weeks, "week");
  return `${unit(weeks, "week")}, ${unit(remDays, "day")}`;
}

/**
 * Exclusive end of the whole-loan holding span.
 * Outstanding principal includes the as-of date. A cleared loan stops before
 * the repayment date. See the module comment.
 */
export function loanHoldingEndExclusive(input: {
  startDate: string;
  asOfDate: string;
  outstanding: boolean;
  zeroDate?: string | null;
}): string {
  if (input.outstanding) {
    const end = addDays(input.asOfDate, 1);
    return compareISO(end, input.startDate) < 0 ? input.startDate : end;
  }
  const zero =
    input.zeroDate && isIsoDate(input.zeroDate) ? input.zeroDate : input.startDate;
  return compareISO(zero, input.startDate) < 0 ? input.startDate : zero;
}

export function formatLoanTotalDuration(input: {
  startDate: string;
  asOfDate: string;
  outstanding: boolean;
  zeroDate?: string | null;
}): string {
  return formatHoldingDuration(input.startDate, loanHoldingEndExclusive(input));
}

export interface OpenLoanDuration {
  label: string;
  hint: string;
  startDate: string;
  openCount: number;
}

/**
 * Duration of the oldest loan that still has principal outstanding.
 * Several open loans are not folded into one span.
 */
export function oldestOpenLoanDuration(
  loans: Array<{ startDate: string; outstanding: boolean }>,
  asOf: string,
): OpenLoanDuration | null {
  const open = loans.filter(
    (loan) => loan.outstanding && compareISO(loan.startDate, asOf) <= 0,
  );
  if (open.length === 0) return null;
  const oldest = open.reduce((current, loan) =>
    compareISO(current.startDate, loan.startDate) <= 0 ? current : loan,
  );
  const from = formatDisplayDate(oldest.startDate);
  const hint =
    open.length === 1
      ? `From ${from}`
      : new Set(open.map((loan) => loan.startDate)).size === 1
        ? `From ${from} · ${open.length} open loans`
        : `Oldest open loan · from ${from}`;
  return {
    label: formatLoanTotalDuration({
      startDate: oldest.startDate,
      asOfDate: asOf,
      outstanding: true,
    }),
    hint,
    startDate: oldest.startDate,
    openCount: open.length,
  };
}
