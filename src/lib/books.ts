import { compareISO, isoFromDbDate } from "./finance/dates";
import {
  calculateLoan,
  deriveLoanStatus,
  fullLedgerAsOf,
  type LoanComputation,
} from "./finance/interest";
import { mapTransaction } from "./map";
import { prisma } from "./db";

export interface BookLoan {
  id: string;
  code: string;
  startDate: string;
  monthlyInterestRate: string;
  annualInterestRate: string;
  originalPrincipal: string;
  notes: string | null;
  status: "ACTIVE" | "CLOSED";
  transactions: ReturnType<typeof mapTransaction>[];
  removedTransactions: ReturnType<typeof mapTransaction>[];
}

export interface PartyBook {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  loans: BookLoan[];
  removedLoans: Array<Pick<BookLoan, "id" | "code" | "startDate" | "originalPrincipal">>;
}

type PartyWithLoans = Awaited<ReturnType<typeof partyQuery>>;

function partyQuery() {
  return prisma.party.findMany({
    include: {
      loans: {
        orderBy: { startDate: "asc" },
        include: {
          transactions: {
            orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });
}

function mapLoan(
  loan: PartyWithLoans[number]["loans"][number],
  dayCountBasis: number,
): BookLoan {
  const live = loan.transactions.filter((txn) => txn.deletedAt === null);
  const removed = loan.transactions.filter((txn) => txn.deletedAt !== null);
  const transactions = live.map(mapTransaction);
  const startDate = isoFromDbDate(loan.startDate);
  const status = deriveLoanStatus({
    monthlyInterestRate: loan.monthlyInterestRate.toString(),
    startDate,
    dayCountBasis,
    transactions,
  });
  return {
    id: loan.id,
    code: loan.code,
    startDate,
    monthlyInterestRate: loan.monthlyInterestRate.toString(),
    annualInterestRate: loan.annualInterestRate.toString(),
    originalPrincipal: loan.originalPrincipal.toString(),
    notes: loan.notes,
    status,
    transactions,
    removedTransactions: removed.map(mapTransaction),
  };
}

function mapParty(party: PartyWithLoans[number], dayCountBasis: number): PartyBook {
  const liveLoans = party.loans.filter((loan) => loan.deletedAt === null);
  const removedLoans = party.loans.filter((loan) => loan.deletedAt !== null);
  return {
    id: party.id,
    code: party.code,
    name: party.name,
    phone: party.phone,
    address: party.address,
    notes: party.notes,
    isActive: party.isActive,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
    loans: liveLoans.map((loan) => mapLoan(loan, dayCountBasis)),
    removedLoans: removedLoans.map((loan) => ({
      id: loan.id,
      code: loan.code,
      startDate: isoFromDbDate(loan.startDate),
      originalPrincipal: loan.originalPrincipal.toString(),
    })),
  };
}

export async function loadParties(dayCountBasis: number): Promise<PartyBook[]> {
  const parties = await partyQuery();
  return parties.map((party) => mapParty(party, dayCountBasis));
}

export async function loadParty(
  id: string,
  dayCountBasis: number,
): Promise<PartyBook | null> {
  const party = await prisma.party.findUnique({
    where: { id },
    include: {
      loans: {
        orderBy: { startDate: "asc" },
        include: {
          transactions: {
            orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  if (!party) return null;
  return mapParty(party, dayCountBasis);
}

export function valueLoan(
  loan: BookLoan,
  asOf: string,
  dayCountBasis: number,
): LoanComputation {
  return calculateLoan({
    monthlyInterestRate: loan.monthlyInterestRate,
    startDate: loan.startDate,
    asOfDate: asOf,
    dayCountBasis,
    transactions: loan.transactions,
  });
}

export function loanHasStarted(loan: BookLoan, asOf: string): boolean {
  return compareISO(loan.startDate, asOf) <= 0;
}

export function horizonFor(loan: BookLoan): string {
  return fullLedgerAsOf(loan.transactions, loan.startDate);
}
