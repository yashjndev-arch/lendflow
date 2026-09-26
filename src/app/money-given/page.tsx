import { LoanForm } from "@/components/loan-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { loadParties } from "@/lib/books";
import { resolveAsOf } from "@/lib/finance/dates";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createLoan } from "@/server/loans";

export const metadata = { title: "Give money" };

export default async function MoneyGivenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const asOf = resolveAsOf(one(params.asOf), settings.timezone);
  const parties = (await loadParties(settings.dayCountBasis)).filter((party) => party.isActive);
  return (
    <div>
      <PageHeader
        title="Add money given"
        description="Each advance is its own loan. The monthly rate belongs to that advance, not to the whole party."
      />
      {parties.length === 0 ? (
        <EmptyState
          title="Add a party first"
          body="Money given is recorded against a party."
          action={<Link href={hrefWith("/parties/new", { asOf })} className={buttonVariants({ className: "h-10" })}>Add Party</Link>}
        />
      ) : (
        <LoanForm
          action={createLoan}
          asOf={asOf}
          parties={parties}
          submitLabel="Save money given"
          initial={{ partyId: one(params.partyId), startDate: asOf }}
        />
      )}
    </div>
  );
}
