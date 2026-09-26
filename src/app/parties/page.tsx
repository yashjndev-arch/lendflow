import Link from "next/link";
import { Flash } from "@/components/flash";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { resolveAsOf } from "@/lib/finance/dates";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Parties" };

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const asOf = resolveAsOf(one(params.asOf), settings.timezone);
  const query = (one(params.q) ?? "").trim().toLowerCase();
  const showArchived = one(params.archived) === "1";
  const parties = await loadParties(settings.dayCountBasis);
  const filtered = parties.filter((party) => {
    if (!party.isActive && !showArchived) return false;
    if (!query) return true;
    const haystack = [party.name, party.code, party.phone, party.address, party.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div>
      <Flash message={one(params.notice)} />
      <PageHeader
        title="Parties"
        description="People and firms you have given money to. Archiving hides a party without deleting the ledger."
        actions={
          <Link href={hrefWith("/parties/new", { asOf })} className={buttonVariants({ className: "h-10" })}>
            Add Party
          </Link>
        }
      />
      <form className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
        <input type="hidden" name="asOf" value={asOf} />
        <div className="grid flex-1 gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">Search</label>
          <Input id="q" name="q" defaultValue={one(params.q) ?? ""} placeholder="Name, mobile, or code" className="h-10 bg-card" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
          Show archived
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline", className: "h-10" })}>
          Search
        </button>
      </form>
      {filtered.length === 0 ? (
        <EmptyState
          title={query ? "No parties match" : "No parties yet"}
          body={query ? "Try another name, mobile number, or party code." : "Add the first party before recording money given."}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Loans</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="no-print" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((party) => (
              <TableRow key={party.id}>
                <TableCell className="num">{party.code}</TableCell>
                <TableCell>
                  <div className="font-medium">{party.name}</div>
                  {party.address ? <div className="text-xs text-muted-foreground">{party.address}</div> : null}
                </TableCell>
                <TableCell>{party.phone || "—"}</TableCell>
                <TableCell className="num">{party.loans.length}</TableCell>
                <TableCell>
                  <Badge variant={party.isActive ? "secondary" : "outline"}>
                    {party.isActive ? "Active" : "Archived"}
                  </Badge>
                </TableCell>
                <TableCell className="no-print text-right">
                  <Link href={hrefWith(`/parties/${party.id}`, { asOf })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    View ledger
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
