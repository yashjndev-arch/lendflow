import Link from "next/link";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Flash } from "@/components/flash";
import { Money } from "@/components/money";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadParties } from "@/lib/books";
import { compareISO, formatDisplayDate, indianFinancialYearStart, isIsoDate, resolveAsOf } from "@/lib/finance/dates";
import { transactionLabel, type TransactionType } from "@/lib/finance/interest";
import { formatINR } from "@/lib/finance/money";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { restoreTransaction } from "@/server/transactions";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const asOf = resolveAsOf(one(params.asOf), settings.timezone);
  const from = one(params.from);
  const fromDate = from && isIsoDate(from) ? from : indianFinancialYearStart(asOf);
  const partyId = one(params.partyId) ?? "";
  const type = one(params.type) ?? "";
  const symbol = settings.currencySymbol;
  const parties = await loadParties(settings.dayCountBasis);
  const rows = parties.flatMap((party) =>
    party.loans.flatMap((loan) =>
      loan.transactions.map((txn) => ({
        ...txn,
        partyId: party.id,
        partyName: party.name,
        loanCode: loan.code,
        removed: false,
      })),
    ),
  );
  const removed = parties.flatMap((party) =>
    party.loans.flatMap((loan) =>
      loan.removedTransactions.map((txn) => ({
        ...txn,
        partyId: party.id,
        partyName: party.name,
        loanCode: loan.code,
        removed: true,
      })),
    ),
  );
  const visible = rows
    .filter((txn) => {
      if (partyId && txn.partyId !== partyId) return false;
      if (type && txn.transactionType !== type) return false;
      if (compareISO(txn.transactionDate, fromDate) < 0) return false;
      if (compareISO(txn.transactionDate, asOf) > 0) return false;
      return true;
    })
    .sort((a, b) => compareISO(b.transactionDate, a.transactionDate));

  return (
    <div>
      <Flash message={one(params.notice)} />
      <PageHeader
        title="Transactions"
        description="The ledger is the source of truth. Editing or removing an entry recalculates every later balance."
      />
      <form className="no-print mb-4 grid gap-3 md:grid-cols-5 md:items-end" method="get">
        <input type="hidden" name="asOf" value={asOf} />
        <label className="grid gap-1.5 text-sm">
          Party
          <select name="partyId" defaultValue={partyId} className="h-10 rounded-lg border border-input bg-card px-2">
            <option value="">All parties</option>
            {parties.map((party) => (
              <option key={party.id} value={party.id}>{party.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Type
          <select name="type" defaultValue={type} className="h-10 rounded-lg border border-input bg-card px-2">
            <option value="">All</option>
            <option value="LOAN_GIVEN">Money given</option>
            <option value="REPAYMENT">Repayment</option>
            <option value="INTEREST_PAYMENT">Interest received</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          From
          <Input type="date" name="from" defaultValue={fromDate} className="h-10 bg-card" />
        </label>
        <p className="text-sm text-muted-foreground">Through {formatDisplayDate(asOf)}, from the header date.</p>
        <button type="submit" className={buttonVariants({ variant: "outline", className: "h-10" })}>Apply</button>
      </form>
      {visible.length === 0 ? (
        <EmptyState title="No transactions in this range" body="Widen the dates or clear the party filter." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Loan</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="no-print" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((txn) => (
              <TableRow key={txn.id}>
                <TableCell className="num">{formatDisplayDate(txn.transactionDate)}</TableCell>
                <TableCell>
                  <Link href={hrefWith(`/parties/${txn.partyId}`, { asOf })} className="underline-offset-4 hover:underline">
                    {txn.partyName}
                  </Link>
                </TableCell>
                <TableCell className="num">{txn.loanCode}</TableCell>
                <TableCell>{transactionLabel(txn.transactionType as TransactionType, txn.paymentType)}</TableCell>
                <TableCell className="text-right"><Money value={txn.amount} symbol={symbol} /></TableCell>
                <TableCell>{txn.notes || "—"}</TableCell>
                <TableCell className="no-print text-right">
                  <Link href={hrefWith(`/transactions/${txn.id}/edit`, { asOf })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Edit
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {removed.length > 0 ? (
        <section className="no-print mt-8">
          <h2 className="mb-3 font-serif text-2xl">Removed transactions</h2>
          <div className="grid gap-2">
            {removed.map((txn) => (
              <div key={txn.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {formatDisplayDate(txn.transactionDate)} · {txn.partyName} · {txn.loanCode} · {formatINR(txn.amount, symbol)}
                </span>
                <ConfirmSubmit
                  action={restoreTransaction}
                  fields={{ id: txn.id, asOf }}
                  label="Restore"
                  title="Restore this transaction?"
                  description="Interest and principal will be recalculated."
                  confirmLabel="Restore"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
