import Decimal from "decimal.js";
import { rollupComputations, uniqueMonthlyRates } from "./finance/aggregate";
import {
  addDays,
  compareISO,
  formatDisplayDate,
  indianFinancialYearStart,
  isIsoDate,
  resolveAsOf,
} from "./finance/dates";
import {
  transactionLabel,
  type LoanComputation,
} from "./finance/interest";
import { formatINR, formatPercent, formatPlainMoney } from "./finance/money";
import { loanHasStarted, valueLoan, type BookLoan, type PartyBook } from "./books";

export const reportKinds = [
  "party-outstanding",
  "interest-receivable",
  "principal-outstanding",
  "payments",
  "transactions",
  "closed",
  "date-range",
] as const;

export type ReportKind = (typeof reportKinds)[number];

export const reportLabels: Record<ReportKind, string> = {
  "party-outstanding": "Party-wise outstanding",
  "interest-receivable": "Interest receivable",
  "principal-outstanding": "Principal outstanding",
  payments: "Payments received",
  transactions: "Transaction history",
  closed: "Closed accounts",
  "date-range": "Date range",
};

export interface ReportQuery {
  kind: ReportKind;
  asOf: string;
  from: string;
  partyId?: string;
  status: "ALL" | "ACTIVE" | "CLOSED";
  rate?: string;
  includeArchived: boolean;
  dayCountBasis: number;
  symbol: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: "right";
}

export interface ReportModel {
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals?: Record<string, string>;
}

interface ValuedLoan {
  party: PartyBook;
  loan: BookLoan;
  asOf: LoanComputation;
  opening: LoanComputation;
  status: "ACTIVE" | "CLOSED";
}

function isKind(value: string | undefined): value is ReportKind {
  return reportKinds.includes(value as ReportKind);
}

export function parseReportKind(value: string | undefined): ReportKind {
  return isKind(value) ? value : "party-outstanding";
}

export function reportQueryFrom(
  input: {
    kind?: string;
    asOf?: string;
    from?: string;
    partyId?: string;
    status?: string;
    rate?: string;
    archived?: string;
  },
  settings: { dayCountBasis: number; currencySymbol: string; timezone: string },
): ReportQuery {
  const asOf = resolveAsOf(input.asOf, settings.timezone);
  const requestedFrom =
    input.from && isIsoDate(input.from) ? input.from : indianFinancialYearStart(asOf);
  const status =
    input.status === "ACTIVE" || input.status === "CLOSED" ? input.status : "ALL";
  return {
    kind: parseReportKind(input.kind),
    asOf,
    from: compareISO(requestedFrom, asOf) > 0 ? asOf : requestedFrom,
    partyId: input.partyId || undefined,
    status,
    rate: input.rate?.trim() || undefined,
    includeArchived: input.archived === "1",
    dayCountBasis: settings.dayCountBasis,
    symbol: settings.currencySymbol,
  };
}

function rateMatches(rate: string, filter?: string): boolean {
  if (!filter) return true;
  const cleaned = filter.replace("%", "").trim();
  if (!cleaned) return true;
  try {
    return new Decimal(rate).eq(new Decimal(cleaned));
  } catch {
    return false;
  }
}

function money(value: Decimal.Value, symbol: string): string {
  return formatINR(value, symbol);
}

function selectLoans(parties: PartyBook[], query: ReportQuery): ValuedLoan[] {
  const openingAsOf = addDays(query.from, -1);
  const selected: ValuedLoan[] = [];
  for (const party of parties) {
    if (!query.includeArchived && !party.isActive) continue;
    if (query.partyId && party.id !== query.partyId) continue;
    for (const loan of party.loans) {
      if (!rateMatches(loan.monthlyInterestRate, query.rate)) continue;
      if (!loanHasStarted(loan, query.asOf)) continue;
      const asOfValue = valueLoan(loan, query.asOf, query.dayCountBasis);
      const position: "ACTIVE" | "CLOSED" =
        new Decimal(asOfValue.outstandingPrincipal).isZero() &&
        new Decimal(asOfValue.principalReceived).gt(0)
          ? "CLOSED"
          : "ACTIVE";
      if (query.status !== "ALL" && query.status !== position) continue;
      selected.push({
        party,
        loan,
        asOf: asOfValue,
        opening: valueLoan(loan, openingAsOf, query.dayCountBasis),
        status: position,
      });
    }
  }
  return selected;
}

function partyGroups(loans: ValuedLoan[]) {
  const groups = new Map<string, ValuedLoan[]>();
  for (const item of loans) {
    const list = groups.get(item.party.id) ?? [];
    list.push(item);
    groups.set(item.party.id, list);
  }
  return [...groups.values()];
}

export function buildReport(parties: PartyBook[], query: ReportQuery): ReportModel {
  const symbol = query.symbol;
  const loans = selectLoans(parties, query);
  const asOfLabel = formatDisplayDate(query.asOf);
  const fromLabel = formatDisplayDate(query.from);

  if (query.kind === "party-outstanding") {
    const rows = partyGroups(loans).map((group) => {
      const party = group[0]!.party;
      const rollup = rollupComputations(group.map((item) => item.asOf));
      const rates = uniqueMonthlyRates(group.map((item) => item.loan.monthlyInterestRate));
      return {
        party: party.name,
        code: party.code,
        given: money(rollup.principalGiven, symbol),
        received: money(rollup.principalReceived, symbol),
        outstanding: money(rollup.outstandingPrincipal, symbol),
        rate: rates.map((rate) => formatPercent(rate)).join(", ") || "—",
        interest: money(rollup.accruedInterest, symbol),
        due: money(rollup.totalDue, symbol),
        last: rollup.lastTransactionDate
          ? formatDisplayDate(rollup.lastTransactionDate)
          : "—",
        _given: rollup.principalGiven,
        _received: rollup.principalReceived,
        _outstanding: rollup.outstandingPrincipal,
        _interest: rollup.accruedInterest,
        _due: rollup.totalDue,
      };
    });
    return {
      title: "Party-wise outstanding",
      description: `Balances as of ${asOfLabel}. Interest is accrued, not yet collected, unless an interest receipt was recorded.`,
      columns: [
        { key: "party", label: "Party" },
        { key: "code", label: "Code" },
        { key: "given", label: "Total given", align: "right" },
        { key: "received", label: "Principal received", align: "right" },
        { key: "outstanding", label: "Principal outstanding", align: "right" },
        { key: "rate", label: "Monthly rate" },
        { key: "interest", label: "Accrued interest", align: "right" },
        { key: "due", label: "Total due", align: "right" },
        { key: "last", label: "Last transaction" },
      ],
      rows: rows.map(strip),
      totals: totalRow(rows, ["_given", "_received", "_outstanding", "_interest", "_due"], {
        _given: "given",
        _received: "received",
        _outstanding: "outstanding",
        _interest: "interest",
        _due: "due",
      }, symbol),
    };
  }

  if (query.kind === "interest-receivable") {
    const rows = loans.map(({ party, loan, asOf }) => ({
      party: party.name,
      loan: loan.code,
      rate: formatPercent(loan.monthlyInterestRate),
      annual: formatPercent(loan.annualInterestRate),
      accrued: money(asOf.accruedInterest, symbol),
      paid: money(asOf.interestPaid, symbol),
      net: money(asOf.netInterest, symbol),
      _accrued: asOf.accruedInterest,
      _paid: asOf.interestPaid,
      _net: asOf.netInterest,
    }));
    return {
      title: "Interest receivable",
      description: `Gross interest accrued up to ${asOfLabel}, interest already received, and the net still receivable.`,
      columns: [
        { key: "party", label: "Party" },
        { key: "loan", label: "Loan" },
        { key: "rate", label: "Monthly rate" },
        { key: "annual", label: "Annual rate" },
        { key: "accrued", label: "Accrued interest", align: "right" },
        { key: "paid", label: "Interest received", align: "right" },
        { key: "net", label: "Net interest due", align: "right" },
      ],
      rows: rows.map(strip),
      totals: totalRow(rows, ["_accrued", "_paid", "_net"], {
        _accrued: "accrued",
        _paid: "paid",
        _net: "net",
      }, symbol),
    };
  }

  if (query.kind === "principal-outstanding") {
    const rows = loans.map(({ party, loan, asOf }) => ({
      party: party.name,
      loan: loan.code,
      start: formatDisplayDate(loan.startDate),
      given: money(asOf.principalGiven, symbol),
      received: money(asOf.principalReceived, symbol),
      outstanding: money(asOf.outstandingPrincipal, symbol),
      status: asOf.outstandingPrincipal === "0" ? "Settled" : "Open",
      _given: asOf.principalGiven,
      _received: asOf.principalReceived,
      _outstanding: asOf.outstandingPrincipal,
    }));
    return {
      title: "Principal outstanding",
      description: `Principal still with each party as of ${asOfLabel}. Interest is not included.`,
      columns: [
        { key: "party", label: "Party" },
        { key: "loan", label: "Loan" },
        { key: "start", label: "Date given" },
        { key: "given", label: "Principal given", align: "right" },
        { key: "received", label: "Principal received", align: "right" },
        { key: "outstanding", label: "Outstanding", align: "right" },
        { key: "status", label: "Position" },
      ],
      rows: rows.map(strip),
      totals: totalRow(rows, ["_given", "_received", "_outstanding"], {
        _given: "given",
        _received: "received",
        _outstanding: "outstanding",
      }, symbol),
    };
  }

  if (query.kind === "payments" || query.kind === "transactions") {
    const paymentsOnly = query.kind === "payments";
    const rows = loans.flatMap(({ party, loan }) =>
      loan.transactions
        .filter((txn) => {
          if (compareISO(txn.transactionDate, query.from) < 0) return false;
          if (compareISO(txn.transactionDate, query.asOf) > 0) return false;
          if (!paymentsOnly) return true;
          return txn.transactionType === "REPAYMENT" || txn.transactionType === "INTEREST_PAYMENT";
        })
        .map((txn) => ({
          date: formatDisplayDate(txn.transactionDate),
          party: party.name,
          loan: loan.code,
          type: transactionLabel(txn.transactionType, txn.paymentType),
          amount: money(txn.amount, symbol),
          principal: money(txn.transactionType === "LOAN_GIVEN" ? txn.principalAmount : txn.principalAmount, symbol),
          interest: money(txn.interestAmount, symbol),
          notes: txn.notes || "—",
          _amount: txn.amount,
          _principal: new Decimal(txn.principalAmount || 0).abs().toFixed(),
          _interest: txn.interestAmount || "0",
          _sort: txn.transactionDate,
        })),
    );
    rows.sort((a, b) => compareISO(a._sort, b._sort));
    return {
      title: paymentsOnly ? "Payments received" : "Transaction history",
      description: paymentsOnly
        ? `Receipts from ${fromLabel} to ${asOfLabel}, including principal and interest.`
        : `Every ledger entry from ${fromLabel} to ${asOfLabel}.`,
      columns: [
        { key: "date", label: "Date" },
        { key: "party", label: "Party" },
        { key: "loan", label: "Loan" },
        { key: "type", label: "Transaction" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "principal", label: "Principal portion", align: "right" },
        { key: "interest", label: "Interest portion", align: "right" },
        { key: "notes", label: "Notes" },
      ],
      rows: rows.map(strip),
      totals: totalRow(rows, ["_amount", "_principal", "_interest"], {
        _amount: "amount",
        _principal: "principal",
        _interest: "interest",
      }, symbol),
    };
  }

  if (query.kind === "closed") {
    const rows = loans
      .filter(
        ({ asOf }) =>
          new Decimal(asOf.outstandingPrincipal).isZero() &&
          new Decimal(asOf.principalReceived).gt(0),
      )
      .map(({ party, loan, asOf }) => ({
        party: party.name,
        loan: loan.code,
        start: formatDisplayDate(loan.startDate),
        rate: formatPercent(loan.monthlyInterestRate),
        received: money(asOf.principalReceived, symbol),
        interest: money(asOf.accruedInterest, symbol),
        net: money(asOf.netInterest, symbol),
        due: money(asOf.totalDue, symbol),
        last: asOf.lastTransactionDate ? formatDisplayDate(asOf.lastTransactionDate) : "—",
        _interest: asOf.accruedInterest,
        _due: asOf.totalDue,
      }));
    return {
      title: "Closed accounts",
      description: `Loans whose principal is fully returned as of ${asOfLabel}. Interest may still be receivable.`,
      columns: [
        { key: "party", label: "Party" },
        { key: "loan", label: "Loan" },
        { key: "start", label: "Date given" },
        { key: "rate", label: "Monthly rate" },
        { key: "received", label: "Principal received", align: "right" },
        { key: "interest", label: "Accrued interest", align: "right" },
        { key: "net", label: "Net interest due", align: "right" },
        { key: "due", label: "Total still due", align: "right" },
        { key: "last", label: "Last transaction" },
      ],
      rows: rows.map(strip),
      totals: totalRow(rows, ["_interest", "_due"], { _interest: "interest", _due: "due" }, symbol),
    };
  }

  const rows = loans.map(({ party, loan, asOf, opening }) => {
    const given = new Decimal(asOf.principalGiven).minus(opening.principalGiven);
    const received = new Decimal(asOf.principalReceived).minus(opening.principalReceived);
    const accrued = new Decimal(asOf.accruedInterest).minus(opening.accruedInterest);
    return {
      party: party.name,
      loan: loan.code,
      opening: money(opening.outstandingPrincipal, symbol),
      given: money(given, symbol),
      received: money(received, symbol),
      accrued: money(accrued, symbol),
      closing: money(asOf.outstandingPrincipal, symbol),
      due: money(asOf.totalDue, symbol),
      _opening: opening.outstandingPrincipal,
      _given: given.toFixed(),
      _received: received.toFixed(),
      _accrued: accrued.toFixed(),
      _closing: asOf.outstandingPrincipal,
      _due: asOf.totalDue,
    };
  });
  return {
    title: "Date range report",
    description: `Movement from ${fromLabel} through ${asOfLabel}. Opening principal is the balance on the day before the from date. Interest accrued is the interest earned inside the range.`,
    columns: [
      { key: "party", label: "Party" },
      { key: "loan", label: "Loan" },
      { key: "opening", label: "Opening principal", align: "right" },
      { key: "given", label: "Given in range", align: "right" },
      { key: "received", label: "Principal received", align: "right" },
      { key: "accrued", label: "Interest accrued", align: "right" },
      { key: "closing", label: "Closing principal", align: "right" },
      { key: "due", label: "Closing total due", align: "right" },
    ],
    rows: rows.map(strip),
    totals: totalRow(
      rows,
      ["_opening", "_given", "_received", "_accrued", "_closing", "_due"],
      {
        _opening: "opening",
        _given: "given",
        _received: "received",
        _accrued: "accrued",
        _closing: "closing",
        _due: "due",
      },
      symbol,
    ),
  };
}

function strip(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_")));
}

function totalRow(
  rows: Record<string, string>[],
  sourceKeys: string[],
  rename: Record<string, string>,
  symbol: string,
): Record<string, string> {
  const totals: Record<string, string> = {};
  for (const key of sourceKeys) {
    const sum = rows.reduce((total, row) => total.plus(row[key] || 0), new Decimal(0));
    totals[rename[key] ?? key] = formatINR(sum, symbol);
  }
  return totals;
}

export function reportToCsv(report: ReportModel): string {
  const header = report.columns.map((column) => csvCell(column.label)).join(",");
  const body = report.rows.map((row) =>
    report.columns.map((column) => csvCell(row[column.key] ?? "")).join(","),
  );
  const totals = report.totals
    ? report.columns
        .map((column, index) =>
          csvCell(index === 0 ? "Total" : (report.totals?.[column.key] ?? "")),
        )
        .join(",")
    : null;
  return `\uFEFF${[header, ...body, ...(totals ? [totals] : [])].join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function reportToExcel(report: ReportModel): string {
  const header = `<Row>${report.columns
    .map((column) => `<Cell><Data ss:Type="String">${xml(column.label)}</Data></Cell>`)
    .join("")}</Row>`;
  const body = report.rows
    .map(
      (row) =>
        `<Row>${report.columns
          .map((column) => {
            const value = row[column.key] ?? "";
            const numeric = column.align === "right" ? plainNumber(value) : null;
            if (numeric !== null) {
              return `<Cell><Data ss:Type="Number">${numeric}</Data></Cell>`;
            }
            return `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`;
          })
          .join("")}</Row>`,
    )
    .join("");
  const totals = report.totals
    ? `<Row>${report.columns
        .map((column, index) => {
          if (index === 0) return `<Cell><Data ss:Type="String">Total</Data></Cell>`;
          const value = report.totals?.[column.key];
          if (!value) return `<Cell><Data ss:Type="String"></Data></Cell>`;
          const numeric = plainNumber(value);
          if (numeric !== null) return `<Cell><Data ss:Type="Number">${numeric}</Data></Cell>`;
          return `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`;
        })
        .join("")}</Row>`
    : "";
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${xml(report.title).slice(0, 31)}">
<Table>
${header}
${body}
${totals}
</Table>
</Worksheet>
</Workbook>`;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function plainNumber(value: string): string | null {
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return formatPlainMoney(cleaned);
}

export function exportFilename(kind: ReportKind, asOf: string, format: "csv" | "xls"): string {
  return `${kind}-${asOf}.${format}`;
}
