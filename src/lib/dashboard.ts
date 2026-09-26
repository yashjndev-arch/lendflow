import Decimal from "decimal.js";
import { rollupComputations, uniqueMonthlyRates } from "./finance/aggregate";
import { oldestOpenLoanDuration } from "./finance/duration";
import { formatPercent } from "./finance/money";
import { loanHasStarted, valueLoan, type PartyBook } from "./books";
import type { Rollup } from "./finance/aggregate";

export interface DashboardRow {
  partyId: string;
  code: string;
  name: string;
  phone: string | null;
  rollup: Rollup;
  ratesLabel: string;
  loanCount: number;
  /** Oldest open loan, through the selected date. Null when nothing is still out. */
  durationLabel: string | null;
  durationHint: string | null;
}

export interface DashboardModel {
  rows: DashboardRow[];
  totals: Rollup;
  activeParties: number;
}

export function buildDashboard(
  parties: PartyBook[],
  asOf: string,
  dayCountBasis: number,
): DashboardModel {
  const rows = parties
    .filter((party) => party.isActive)
    .map((party) => {
      const loans = party.loans.filter((loan) => loanHasStarted(loan, asOf));
      const valued = loans.map((loan) => ({
        loan,
        computation: valueLoan(loan, asOf, dayCountBasis),
      }));
      const duration = oldestOpenLoanDuration(
        valued.map((item) => ({
          startDate: item.loan.startDate,
          outstanding: new Decimal(item.computation.outstandingPrincipal).gt(0),
        })),
        asOf,
      );
      return {
        partyId: party.id,
        code: party.code,
        name: party.name,
        phone: party.phone,
        rollup: rollupComputations(valued.map((item) => item.computation)),
        ratesLabel:
          uniqueMonthlyRates(loans.map((loan) => loan.monthlyInterestRate))
            .map((rate) => formatPercent(rate))
            .join(", ") || "—",
        loanCount: loans.length,
        durationLabel: duration?.label ?? null,
        durationHint: duration?.hint ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const started = parties
    .filter((party) => party.isActive)
    .flatMap((party) =>
      party.loans
        .filter((loan) => loanHasStarted(loan, asOf))
        .map((loan) => valueLoan(loan, asOf, dayCountBasis)),
    );

  return {
    rows,
    totals: rollupComputations(started),
    activeParties: rows.filter((row) =>
      new Decimal(row.rollup.outstandingPrincipal).gt(0),
    ).length,
  };
}
