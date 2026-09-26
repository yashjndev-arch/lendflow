import { notFound } from "next/navigation";
import { TransactionForm } from "@/components/transaction-form";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { isoFromDbDate, resolveAsOf } from "@/lib/finance/dates";
import { one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { updateTransaction } from "@/server/transactions";

export const metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const settings = await getSettings();
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { loanAccount: true, party: true },
  });
  if (!txn || txn.deletedAt || txn.loanAccount.deletedAt) notFound();
  const asOf = resolveAsOf(one(query.asOf), settings.timezone);
  return (
    <div>
      <PageHeader
        title="Edit transaction"
        description="The ledger is recalculated from the edited entry forward. Principal cannot be driven below zero."
      />
      <TransactionForm
        action={updateTransaction}
        asOf={asOf}
        transaction={{
          id: txn.id,
          transactionType: txn.transactionType,
          paymentType: txn.paymentType,
          amount: txn.amount.toString(),
          principalAmount: txn.principalAmount.toString(),
          interestAmount: txn.interestAmount.toString(),
          transactionDate: isoFromDbDate(txn.transactionDate),
          notes: txn.notes,
          monthlyInterestRate: txn.loanAccount.monthlyInterestRate.toString(),
          loanCode: txn.loanAccount.code,
          partyName: txn.party.name,
        }}
      />
    </div>
  );
}
