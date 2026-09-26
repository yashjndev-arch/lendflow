import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { PrintHeading } from "@/components/print-heading";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadParties } from "@/lib/books";
import { formatDisplayDate } from "@/lib/finance/dates";
import {
  buildReport,
  reportKinds,
  reportLabels,
  reportQueryFrom,
} from "@/lib/reports";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const query = reportQueryFrom(
    {
      kind: one(params.kind),
      asOf: one(params.asOf),
      from: one(params.from),
      partyId: one(params.partyId),
      status: one(params.status),
      rate: one(params.rate),
      archived: one(params.archived),
    },
    settings,
  );
  const parties = await loadParties(settings.dayCountBasis);
  const report = buildReport(parties, query);
  const exportParams = {
    kind: query.kind,
    asOf: query.asOf,
    from: query.from,
    partyId: query.partyId,
    status: query.status,
    rate: query.rate,
    archived: query.includeArchived ? "1" : undefined,
  };

  return (
    <div>
      <PrintHeading
        businessName={settings.businessName}
        address={settings.address}
        phone={settings.phone}
        title={report.title}
        asOf={query.asOf}
      />
      <Flash message={one(params.notice)} />
      <PageHeader
        title="Reports"
        description={report.description}
        actions={
          <>
            <PrintButton />
            <Link href={hrefWith("/api/reports/export", { ...exportParams, format: "csv" })} className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Export CSV
            </Link>
            <Link href={hrefWith("/api/reports/export", { ...exportParams, format: "xls" })} className={buttonVariants({ variant: "outline", className: "h-10" })}>
              Export Excel
            </Link>
          </>
        }
      />
      <form className="no-print mb-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6" method="get">
        <input type="hidden" name="asOf" value={query.asOf} />
        <label className="grid gap-1.5 text-sm">
          Report
          <select name="kind" defaultValue={query.kind} className="h-10 rounded-lg border border-input bg-card px-2">
            {reportKinds.map((kind) => (
              <option key={kind} value={kind}>{reportLabels[kind]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Party
          <select name="partyId" defaultValue={query.partyId ?? ""} className="h-10 rounded-lg border border-input bg-card px-2">
            <option value="">All parties</option>
            {parties.map((party) => (
              <option key={party.id} value={party.id}>{party.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          From date
          <Input type="date" name="from" defaultValue={query.from} className="h-10 bg-card" />
        </label>
        <label className="grid gap-1.5 text-sm">
          Status
          <select name="status" defaultValue={query.status} className="h-10 rounded-lg border border-input bg-card px-2">
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Monthly rate
          <Input name="rate" defaultValue={query.rate ?? ""} placeholder="1.75" className="h-10 bg-card" />
        </label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={query.includeArchived} />
            Include archived
          </label>
          <button type="submit" className={buttonVariants({ className: "h-10" })}>Apply filters</button>
        </div>
      </form>
      <p className="mb-3 text-sm text-muted-foreground">
        Balances use {formatDisplayDate(query.asOf)}. Range reports start on {formatDisplayDate(query.from)}.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {report.columns.map((column) => (
              <TableHead key={column.key} className={column.align === "right" ? "text-right" : undefined}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={report.columns.length} className="text-muted-foreground">
                Nothing matches these filters.
              </TableCell>
            </TableRow>
          ) : (
            report.rows.map((row, index) => (
              <TableRow key={`${row.party ?? ""}-${row.loan ?? ""}-${row.date ?? ""}-${index}`}>
                {report.columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={column.align === "right" ? "num text-right" : undefined}
                  >
                    {row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {report.totals && report.rows.length > 0 ? (
          <TableFooter>
            <TableRow>
              {report.columns.map((column, index) => (
                <TableCell key={column.key} className={column.align === "right" ? "num text-right" : undefined}>
                  {index === 0 ? "Total" : (report.totals?.[column.key] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
