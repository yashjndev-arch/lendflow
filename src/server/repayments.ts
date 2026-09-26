"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, invalid, str, type ActionState } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { isoFromDbDate, parseISODate, resolveAsOf } from "@/lib/finance/dates";
import { previewRepayment } from "@/lib/finance/interest";
import { mapTransaction } from "@/lib/map";
import { refreshLoanStatus } from "@/lib/persist";
import { getSettings } from "@/lib/settings";
import { portionsFromRepayment, repaymentSchema } from "@/lib/validation";

export async function createRepayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = repaymentSchema.safeParse({
    partyId: str(formData, "partyId"),
    loanAccountId: str(formData, "loanAccountId"),
    transactionDate: str(formData, "transactionDate"),
    paymentType: str(formData, "paymentType"),
    amount: str(formData, "amount"),
    principalAmount: str(formData, "principalAmount"),
    interestAmount: str(formData, "interestAmount"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) {
    return invalid("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const settings = await getSettings();
  const asOf = resolveAsOf(str(formData, "asOf") || undefined, settings.timezone);
  const loan = await prisma.loanAccount.findUnique({
    where: { id: parsed.data.loanAccountId },
    include: {
      party: true,
      transactions: { where: { deletedAt: null } },
    },
  });
  if (!loan || loan.deletedAt || loan.partyId !== parsed.data.partyId) {
    return invalid("Select a loan that belongs to this party.");
  }
  if (!loan.party.isActive) {
    return invalid("Restore this party before recording a repayment.");
  }
  const portions = portionsFromRepayment(parsed.data);
  const preview = previewRepayment({
    monthlyInterestRate: loan.monthlyInterestRate.toString(),
    startDate: isoFromDbDate(loan.startDate),
    transactions: loan.transactions.map(mapTransaction),
    dayCountBasis: settings.dayCountBasis,
    repaymentDate: parsed.data.transactionDate,
    principalAmount: portions.principalAmount,
    interestAmount: portions.interestAmount,
    valuationDate: asOf,
  });
  if (!preview.ok) {
    return invalid(preview.message ?? "This repayment cannot be saved.");
  }
  try {
    await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          loanAccountId: loan.id,
          partyId: loan.partyId,
          transactionType: new Decimal(portions.principalAmount).isZero()
            ? "INTEREST_PAYMENT"
            : "REPAYMENT",
          paymentType: parsed.data.paymentType,
          amount: portions.amount,
          principalAmount: portions.principalAmount,
          interestAmount: portions.interestAmount,
          transactionDate: parseISODate(parsed.data.transactionDate),
          notes: parsed.data.notes,
        },
      });
      await refreshLoanStatus(tx, loan.id);
      await writeAudit(tx, {
        entityType: "Transaction",
        entityId: txn.id,
        action: "CREATE",
        summary: `Recorded a ${parsed.data.paymentType.toLowerCase()} receipt of ${portions.amount} on ${loan.code}.`,
        newValue: { ...portions, date: parsed.data.transactionDate, paymentType: parsed.data.paymentType },
      });
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not save the repayment. Please try again.");
  }
  revalidatePath("/", "layout");
  const params = new URLSearchParams({
    notice: "Repayment saved. Interest was recalculated.",
    asOf,
  });
  redirect(`/parties/${loan.partyId}?${params.toString()}`);
}
