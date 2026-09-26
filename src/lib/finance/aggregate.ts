import Decimal from "decimal.js";
import type { LoanComputation } from "./interest";
import { exact } from "./money";

export interface Rollup {
  principalGiven: string;
  principalReceived: string;
  outstandingPrincipal: string;
  accruedInterest: string;
  interestPaid: string;
  netInterest: string;
  totalDue: string;
  lastTransactionDate: string | null;
}

function sum(values: string[]): string {
  return exact(
    values.reduce((total, value) => total.plus(value), new Decimal(0)),
  );
}

export function rollupComputations(items: LoanComputation[]): Rollup {
  const dates = items
    .map((item) => item.lastTransactionDate)
    .filter((date): date is string => Boolean(date))
    .sort();
  return {
    principalGiven: sum(items.map((item) => item.principalGiven)),
    principalReceived: sum(items.map((item) => item.principalReceived)),
    outstandingPrincipal: sum(items.map((item) => item.outstandingPrincipal)),
    accruedInterest: sum(items.map((item) => item.accruedInterest)),
    interestPaid: sum(items.map((item) => item.interestPaid)),
    netInterest: sum(items.map((item) => item.netInterest)),
    totalDue: sum(items.map((item) => item.totalDue)),
    lastTransactionDate: dates.at(-1) ?? null,
  };
}

export function uniqueMonthlyRates(rates: string[]): string[] {
  const seen = new Map<string, string>();
  for (const rate of rates) {
    const key = new Decimal(rate).toFixed(6);
    if (!seen.has(key)) seen.set(key, rate);
  }
  return [...seen.values()];
}
