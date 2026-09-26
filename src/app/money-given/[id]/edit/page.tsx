import { notFound } from "next/navigation";
import { LoanForm } from "@/components/loan-form";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { isoFromDbDate, resolveAsOf } from "@/lib/finance/dates";
import { one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { updateLoan } from "@/server/loans";

export const metadata = { title: "Edit money given" };

export default async function EditLoanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const settings = await getSettings();
  const loan = await prisma.loanAccount.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!loan || loan.deletedAt) notFound();
  const asOf = resolveAsOf(one(query.asOf), settings.timezone);
  return (
    <div>
      <PageHeader
        title={`Edit ${loan.code}`}
        description={`Given to ${loan.party.name}. Changing the amount, date, or rate recalculates the whole loan.`}
      />
      <LoanForm
        action={updateLoan}
        asOf={asOf}
        parties={[{ id: loan.party.id, name: loan.party.name, code: loan.party.code }]}
        lockParty
        submitLabel="Save loan"
        initial={{
          id: loan.id,
          partyId: loan.partyId,
          amount: loan.originalPrincipal.toString(),
          startDate: isoFromDbDate(loan.startDate),
          monthlyInterestRate: loan.monthlyInterestRate.toString(),
          notes: loan.notes,
        }}
      />
    </div>
  );
}
