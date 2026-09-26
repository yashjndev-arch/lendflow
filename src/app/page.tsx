import Link from "next/link";
import Decimal from "decimal.js";
import { Flash } from "@/components/flash";
import { Money } from "@/components/money";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PrintHeading } from "@/components/print-heading";
import { StatCard } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadParties } from "@/lib/books";
import { buildDashboard } from "@/lib/dashboard";
import { formatDisplayDate, resolveAsOf } from "@/lib/finance/dates";
import { formatINR } from "@/lib/finance/money";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const asOf = resolveAsOf(one(params.asOf), settings.timezone);
  const parties = await loadParties(settings.dayCountBasis);
  const dashboard = buildDashboard(parties, asOf, settings.dayCountBasis);
  const symbol = settings.currencySymbol;
  const notice = one(params.notice);

  return (
    <div>
      <PrintHeading
        businessName={settings.businessName}
        address={settings.address}
        phone={settings.phone}
        title="Outstanding summary"
        asOf={asOf}
      />
      <Flash message={notice} />
      <PageHeader
        eyebrow={formatDisplayDate(asOf)}
        title="Dashboard"
        description="Money still out with each party, interest accrued to the selected date, and the total receivable."
        actions={
          <>
            <Link href={hrefWith("/parties/new", { asOf })} className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Add Party
            </Link>
            <Link href={hrefWith("/money-given", { asOf })} className={buttonVariants({ className: "h-10" })}>
              Give Money
            </Link>
            <Link href={hrefWith("/repayments", { asOf })} className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Add Repayment
            </Link>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total principal given" value={formatINR(dashboard.totals.principalGiven, symbol)} tone="given" />
        <StatCard label="Total principal received" value={formatINR(dashboard.totals.principalReceived, symbol)} tone="received" />
        <StatCard label="Total principal outstanding" value={formatINR(dashboard.totals.outstandingPrincipal, symbol)} tone="due" hint="Returned principal is no longer charged interest." />
        <StatCard label="Total interest accrued" value={formatINR(dashboard.totals.accruedInterest, symbol)} hint={`Simple interest through ${formatDisplayDate(asOf)}.`} />
        <StatCard label="Total amount receivable" value={formatINR(dashboard.totals.totalDue, symbol)} hint="Outstanding principal plus net interest." />
        <StatCard label="Active parties" value={String(dashboard.activeParties)} hint="Parties that still hold principal." />
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Interest is simple. A monthly rate of 1% equals 12% a year, charged as principal × annual rate × days ÷ {settings.dayCountBasis}. A repayment reduces principal from that date onward. Accrued interest stays separate.
      </p>
      <section className="mt-6">
        {dashboard.rows.length === 0 ? (
          <EmptyState
            title="No parties yet"
            body="Add a party, then record the money you gave and the monthly interest rate."
            action={
              <Link href={hrefWith("/parties/new", { asOf })} className={buttonVariants({ className: "h-10" })}>
                Add Party
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {dashboard.rows.map((row) => (
                <article key={row.partyId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">{row.name}</h2>
                      <p className="text-xs text-muted-foreground">{row.code} · {row.ratesLabel}</p>
                    </div>
                    <Link href={hrefWith(`/parties/${row.partyId}`, { asOf })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      View
                    </Link>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Given</dt>
                      <dd><Money value={row.rollup.principalGiven} symbol={symbol} tone="given" /></dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Received</dt>
                      <dd><Money value={row.rollup.principalReceived} symbol={symbol} tone="received" /></dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Outstanding</dt>
                      <dd><Money value={row.rollup.outstandingPrincipal} symbol={symbol} tone={new Decimal(row.rollup.outstandingPrincipal).gt(0) ? "due" : undefined} /></dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total due</dt>
                      <dd><Money value={row.rollup.totalDue} symbol={symbol} /></dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Party</TableHead>
                    <TableHead className="text-right">Total given</TableHead>
                    <TableHead className="text-right">Principal received</TableHead>
                    <TableHead className="text-right">Principal outstanding</TableHead>
                    <TableHead>Monthly rate</TableHead>
                    <TableHead className="text-right">Accrued interest</TableHead>
                    <TableHead className="text-right">Total due</TableHead>
                    <TableHead>Last transaction</TableHead>
                    <TableHead className="no-print" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.rows.map((row) => (
                    <TableRow key={row.partyId}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.code}</div>
                      </TableCell>
                      <TableCell className="text-right"><Money value={row.rollup.principalGiven} symbol={symbol} tone="given" /></TableCell>
                      <TableCell className="text-right"><Money value={row.rollup.principalReceived} symbol={symbol} tone="received" /></TableCell>
                      <TableCell className="text-right">
                        <Money value={row.rollup.outstandingPrincipal} symbol={symbol} tone={new Decimal(row.rollup.outstandingPrincipal).gt(0) ? "due" : undefined} />
                      </TableCell>
                      <TableCell className="num">{row.ratesLabel}</TableCell>
                      <TableCell className="text-right"><Money value={row.rollup.accruedInterest} symbol={symbol} /></TableCell>
                      <TableCell className="text-right"><Money value={row.rollup.totalDue} symbol={symbol} /></TableCell>
                      <TableCell className="num">
                        {row.rollup.lastTransactionDate ? formatDisplayDate(row.rollup.lastTransactionDate) : "—"}
                      </TableCell>
                      <TableCell className="no-print text-right">
                        <Link href={hrefWith(`/parties/${row.partyId}`, { asOf })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
