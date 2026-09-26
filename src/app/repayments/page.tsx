import Link from "next/link";
import { RepaymentForm } from "@/components/repayment-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { loadParties } from "@/lib/books";
import { resolveAsOf } from "@/lib/finance/dates";
import { hrefWith, one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { createRepayment } from "@/server/repayments";

export const metadata = { title: "Add repayment" };

export default async function RepaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const asOf = resolveAsOf(one(params.asOf), settings.timezone);
  const parties = (await loadParties(settings.dayCountBasis))
    .filter((party) => party.isActive && party.loans.length > 0)
    .map((party) => ({
      id: party.id,
      name: party.name,
      code: party.code,
      loans: party.loans.map((loan) => ({
        id: loan.id,
        code: loan.code,
        startDate: loan.startDate,
        monthlyInterestRate: loan.monthlyInterestRate,
        originalPrincipal: loan.originalPrincipal,
        transactions: loan.transactions,
      })),
    }));
  return (
    <div>
      <PageHeader
        title="Add repayment"
        description="Principal receipts reduce the balance from the repayment date. Interest you have already accrued is not deducted unless you choose an interest payment."
      />
      {parties.length === 0 ? (
        <EmptyState
          title="No loans to repay"
          body="Record money given before entering a repayment."
          action={<Link href={hrefWith("/money-given", { asOf })} className={buttonVariants({ className: "h-10" })}>Give Money</Link>}
        />
      ) : (
        <RepaymentForm
          action={createRepayment}
          asOf={asOf}
          parties={parties}
          initialPartyId={one(params.partyId)}
          dayCountBasis={settings.dayCountBasis}
          symbol={settings.currencySymbol}
        />
      )}
    </div>
  );
}
