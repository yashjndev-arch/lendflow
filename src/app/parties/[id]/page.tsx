import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Flash } from "@/components/flash";
import { InterestTable } from "@/components/interest-table";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { PrintHeading } from "@/components/print-heading";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loanHasStarted, loadParty, valueLoan } from "@/lib/books";
import { rollupComputations } from "@/lib/finance/aggregate";
import { compareISO, formatDisplayDate, resolveAsOf } from "@/lib/finance/dates";
import { transactionLabel } from "@/lib/finance/interest";
import { formatINR, formatPercent } from "@/lib/finance/money";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { deleteLoan, restoreLoan } from "@/server/loans";
import { archiveParty, restoreParty } from "@/server/parties";
import { deleteTransaction, restoreTransaction } from "@/server/transactions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const settings = await getSettings();
  const party = await loadParty(id, settings.dayCountBasis);
  return { title: party?.name ?? "Party" };
}

export default async function PartyLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const settings = await getSettings();
  const party = await loadParty(id, settings.dayCountBasis);
  if (!party) notFound();
  const asOf = resolveAsOf(one(query.asOf), settings.timezone);
  const symbol = settings.currencySymbol;
  const started = party.loans.filter((loan) => loanHasStarted(loan, asOf));
  const upcoming = party.loans.filter((loan) => !loanHasStarted(loan, asOf));
  const valued = started.map((loan) => ({
    loan,
    computation: valueLoan(loan, asOf, settings.dayCountBasis),
  }));
  const totals = rollupComputations(valued.map((item) => item.computation));
  const history = valued
    .flatMap(({ loan, computation }) =>
      computation.rows.map((row) => ({
        ...row,
        loanId: loan.id,
        loanCode: loan.code,
        rate: loan.monthlyInterestRate,
      })),
    )
    .sort((a, b) => compareISO(a.date, b.date) || a.loanCode.localeCompare(b.loanCode));
  const future = party.loans.flatMap((loan) =>
    loan.transactions
      .filter((txn) => compareISO(txn.transactionDate, asOf) > 0)
      .map((txn) => ({ ...txn, loanCode: loan.code, loanId: loan.id, rate: loan.monthlyInterestRate })),
  );
  const removed = party.loans.flatMap((loan) =>
    loan.removedTransactions.map((txn) => ({ ...txn, loanCode: loan.code })),
  );

  return (
    <div>
      <PrintHeading
        businessName={settings.businessName}
        address={settings.address}
        phone={settings.phone}
        title={`${party.name} ledger`}
        asOf={asOf}
      />
      <Flash message={one(query.notice)} />
      <PageHeader
        eyebrow={party.code}
        title={party.name}
        description={[party.phone, party.address].filter(Boolean).join(" · ") || "No contact details yet."}
        actions={
          <>
            <PrintButton />
            <Link href={hrefWith(`/parties/${party.id}/edit`, { asOf })} className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Edit party
            </Link>
            <Link href={hrefWith("/money-given", { asOf, partyId: party.id })} className={buttonVariants({ className: "h-10" })}>
              Give Money
            </Link>
            <Link href={hrefWith("/repayments", { asOf, partyId: party.id })} className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Add Repayment
            </Link>
          </>
        }
      />
      {!party.isActive ? (
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <p>This party is archived. The ledger is unchanged.</p>
          <ConfirmSubmit
            action={restoreParty}
            fields={{ id: party.id }}
            label="Restore party"
            title="Restore this party?"
            description="The party will show on the dashboard again."
            confirmLabel="Restore"
          />
        </div>
      ) : (
        <div className="no-print mb-4">
          <ConfirmSubmit
            action={archiveParty}
            fields={{ id: party.id }}
            label="Archive party"
            title={`Archive ${party.name}?`}
            description="The party leaves the dashboard. Loans and transactions stay in the database."
            confirmLabel="Archive"
          />
        </div>
      )}
      {party.notes ? <p className="mb-4 text-sm text-muted-foreground">{party.notes}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total money given" value={formatINR(totals.principalGiven, symbol)} tone="given" />
        <StatCard label="Principal returned" value={formatINR(totals.principalReceived, symbol)} tone="received" />
        <StatCard label="Outstanding principal" value={formatINR(totals.outstandingPrincipal, symbol)} tone="due" />
        <StatCard label="Accrued interest" value={formatINR(totals.accruedInterest, symbol)} />
        <StatCard label="Total amount due" value={formatINR(totals.totalDue, symbol)} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-2xl">Transaction history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Loan</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Principal balance</TableHead>
              <TableHead>Interest rate</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="no-print" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No transactions on or before {formatDisplayDate(asOf)}.
                </TableCell>
              </TableRow>
            ) : (
              history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="num">{formatDisplayDate(row.date)}</TableCell>
                  <TableCell className="num">{row.loanCode}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right">
                    <Money
                      value={row.amount}
                      symbol={symbol}
                      tone={row.transactionType === "LOAN_GIVEN" ? "given" : "received"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={row.principalBalance} symbol={symbol} />
                  </TableCell>
                  <TableCell className="num">{formatPercent(row.rate)}</TableCell>
                  <TableCell>{row.notes || "—"}</TableCell>
                  <TableCell className="no-print">
                    <div className="flex justify-end gap-2">
                      <Link href={hrefWith(`/transactions/${row.id}/edit`, { asOf })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Edit
                      </Link>
                      {row.transactionType === "LOAN_GIVEN" ? null : (
                        <ConfirmSubmit
                          action={deleteTransaction}
                          fields={{ id: row.id, asOf }}
                          label="Delete"
                          title="Delete this transaction?"
                          description={`Remove ${row.label.toLowerCase()} of ${formatINR(row.amount, symbol)} on ${formatDisplayDate(row.date)}. Interest will be recalculated. You can restore it afterwards.`}
                          confirmLabel="Delete transaction"
                          variant="destructive"
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {valued.map(({ loan, computation }) => (
        <section key={loan.id} className="mt-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Interest calculation · {loan.code}</h2>
              <p className="text-sm text-muted-foreground">
                {formatINR(loan.originalPrincipal, symbol)} from {formatDisplayDate(loan.startDate)} at {formatPercent(loan.monthlyInterestRate)} monthly ({formatPercent(loan.annualInterestRate)} a year).
                {" "}
                <Badge variant={loan.status === "CLOSED" ? "outline" : "secondary"}>
                  {loan.status === "CLOSED" ? "Closed" : "Active"}
                </Badge>
              </p>
            </div>
            <div className="no-print flex gap-2">
              <Link href={hrefWith(`/money-given/${loan.id}/edit`, { asOf })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Edit terms
              </Link>
              <ConfirmSubmit
                action={deleteLoan}
                fields={{ id: loan.id, asOf }}
                label="Delete loan"
                title={`Delete ${loan.code}?`}
                description="The loan and its transactions are hidden from balances. You can restore them later. Nothing is erased permanently."
                confirmLabel="Delete loan"
                variant="destructive"
              />
            </div>
          </div>
          <InterestTable
            periods={computation.periods}
            symbol={symbol}
            accrued={computation.accruedInterest}
            outstanding={computation.outstandingPrincipal}
            totalDue={computation.totalDue}
          />
        </section>
      ))}

      <section className="mt-8 rounded-xl border border-border bg-card px-4 py-4">
        <h2 className="font-serif text-2xl">Party total</h2>
        <div className="mt-3 grid gap-1 text-sm sm:max-w-md">
          <div className="flex justify-between"><span>Total accrued interest</span><Money value={totals.accruedInterest} symbol={symbol} /></div>
          <div className="flex justify-between"><span>Outstanding principal</span><Money value={totals.outstandingPrincipal} symbol={symbol} tone="due" /></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-medium">
            <span>Grand total due</span>
            <span>{formatINR(totals.totalDue, symbol)}</span>
          </div>
        </div>
        {new Decimal(totals.interestPaid).gt(0) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Interest already received: {formatINR(totals.interestPaid, symbol)}. Net interest due is {formatINR(totals.netInterest, symbol)}.
          </p>
        ) : null}
      </section>

      {upcoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 font-serif text-2xl">Not yet started</h2>
          <p className="text-sm text-muted-foreground">
            These advances begin after {formatDisplayDate(asOf)}, so they are left out of this balance.
          </p>
          <ul className="mt-2 text-sm">
            {upcoming.map((loan) => (
              <li key={loan.id}>
                {loan.code} · {formatINR(loan.originalPrincipal, symbol)} on {formatDisplayDate(loan.startDate)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {future.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 font-serif text-2xl">After the selected date</h2>
          <p className="mb-3 text-sm text-muted-foreground">These entries are saved, but they do not affect the balance above.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Loan</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {future.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="num">{formatDisplayDate(txn.transactionDate)}</TableCell>
                  <TableCell>{txn.loanCode}</TableCell>
                  <TableCell>{transactionLabel(txn.transactionType, txn.paymentType)}</TableCell>
                  <TableCell className="text-right"><Money value={txn.amount} symbol={symbol} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {removed.length > 0 || party.removedLoans.length > 0 ? (
        <section className="no-print mt-8">
          <h2 className="mb-3 font-serif text-2xl">Removed</h2>
          <div className="grid gap-2">
            {party.removedLoans.map((loan) => (
              <div key={loan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>{loan.code} · {formatINR(loan.originalPrincipal, symbol)} · {formatDisplayDate(loan.startDate)}</span>
                <ConfirmSubmit
                  action={restoreLoan}
                  fields={{ id: loan.id, asOf }}
                  label="Restore loan"
                  title={`Restore ${loan.code}?`}
                  description="The loan and its transactions return to the ledger and interest is recalculated."
                  confirmLabel="Restore"
                />
              </div>
            ))}
            {removed.map((txn) => (
              <div key={txn.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {formatDisplayDate(txn.transactionDate)} · {txn.loanCode} · {transactionLabel(txn.transactionType, txn.paymentType)} · {formatINR(txn.amount, symbol)}
                </span>
                <ConfirmSubmit
                  action={restoreTransaction}
                  fields={{ id: txn.id, asOf }}
                  label="Restore"
                  title="Restore this transaction?"
                  description="The ledger will be recalculated with this entry included."
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
