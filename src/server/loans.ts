"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, invalid, str, type ActionState } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { compareISO, isoFromDbDate, parseISODate } from "@/lib/finance/dates";
import { ledgerError } from "@/lib/finance/interest";
import { annualRateFromMonthly, exact } from "@/lib/finance/money";
import { mapTransaction } from "@/lib/map";
import { nextCode, refreshLoanStatus } from "@/lib/persist";
import { loanSchema } from "@/lib/validation";

function back(partyId: string, asOf: string, notice: string) {
  const params = new URLSearchParams({ notice });
  if (asOf) params.set("asOf", asOf);
  return `/parties/${partyId}?${params.toString()}`;
}

export async function createLoan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loanSchema.safeParse({
    partyId: str(formData, "partyId"),
    amount: str(formData, "amount"),
    startDate: str(formData, "startDate"),
    monthlyInterestRate: str(formData, "monthlyInterestRate"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) {
    return invalid("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const asOf = str(formData, "asOf");
  const party = await prisma.party.findUnique({ where: { id: parsed.data.partyId } });
  if (!party || !party.isActive) {
    return invalid("Choose an active party before giving money.");
  }
  const annual = exact(annualRateFromMonthly(parsed.data.monthlyInterestRate));
  try {
    await prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, "loan");
      const loan = await tx.loanAccount.create({
        data: {
          code,
          partyId: party.id,
          originalPrincipal: parsed.data.amount,
          startDate: parseISODate(parsed.data.startDate),
          monthlyInterestRate: parsed.data.monthlyInterestRate,
          annualInterestRate: annual,
          notes: parsed.data.notes,
          status: "ACTIVE",
        },
      });
      await tx.transaction.create({
        data: {
          loanAccountId: loan.id,
          partyId: party.id,
          transactionType: "LOAN_GIVEN",
          amount: parsed.data.amount,
          principalAmount: parsed.data.amount,
          interestAmount: "0",
          transactionDate: parseISODate(parsed.data.startDate),
          notes: parsed.data.notes,
        },
      });
      await writeAudit(tx, {
        entityType: "LoanAccount",
        entityId: loan.id,
        action: "CREATE",
        summary: `Gave ${parsed.data.amount} to ${party.name} on ${parsed.data.startDate} at ${parsed.data.monthlyInterestRate}% per month.`,
        newValue: { ...parsed.data, code, annualInterestRate: annual },
      });
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not record the money given. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect(back(party.id, asOf, "Money given recorded."));
}

export async function updateLoan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = str(formData, "id");
  const parsed = loanSchema.safeParse({
    partyId: str(formData, "partyId"),
    amount: str(formData, "amount"),
    startDate: str(formData, "startDate"),
    monthlyInterestRate: str(formData, "monthlyInterestRate"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) {
    return invalid("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const asOf = str(formData, "asOf");
  const loan = await prisma.loanAccount.findUnique({
    where: { id },
    include: { transactions: true, party: true },
  });
  if (!loan || loan.deletedAt) return invalid("That loan could not be found.");
  if (loan.partyId !== parsed.data.partyId) {
    return invalid("A loan stays with the party it was given to.");
  }
  const opening = loan.transactions.find(
    (txn) => txn.transactionType === "LOAN_GIVEN" && txn.deletedAt === null,
  );
  if (!opening) return invalid("The opening money-given entry is missing.");
  const others = loan.transactions.filter(
    (txn) => txn.deletedAt === null && txn.id !== opening.id,
  );
  if (others.some((txn) => compareISO(isoFromDbDate(txn.transactionDate), parsed.data.startDate) < 0)) {
    return invalid("The date given cannot be after a later transaction on this loan.");
  }
  const transactions = loan.transactions
    .filter((txn) => txn.deletedAt === null)
    .map(mapTransaction)
    .map((txn) =>
      txn.id === opening.id
        ? {
            ...txn,
            amount: parsed.data.amount,
            principalAmount: parsed.data.amount,
            transactionDate: parsed.data.startDate,
            notes: parsed.data.notes,
          }
        : txn,
    );
  const problem = ledgerError({
    monthlyInterestRate: parsed.data.monthlyInterestRate,
    startDate: parsed.data.startDate,
    transactions,
  });
  if (problem) return invalid(problem);
  const annual = exact(annualRateFromMonthly(parsed.data.monthlyInterestRate));
  try {
    await prisma.$transaction(async (tx) => {
      await tx.loanAccount.update({
        where: { id },
        data: {
          originalPrincipal: parsed.data.amount,
          startDate: parseISODate(parsed.data.startDate),
          monthlyInterestRate: parsed.data.monthlyInterestRate,
          annualInterestRate: annual,
          notes: parsed.data.notes,
        },
      });
      await tx.transaction.update({
        where: { id: opening.id },
        data: {
          amount: parsed.data.amount,
          principalAmount: parsed.data.amount,
          transactionDate: parseISODate(parsed.data.startDate),
          notes: parsed.data.notes,
        },
      });
      await refreshLoanStatus(tx, id);
      await writeAudit(tx, {
        entityType: "LoanAccount",
        entityId: id,
        action: "UPDATE",
        summary: `Updated ${loan.code} for ${loan.party.name}. Interest was recalculated.`,
        previousValue: {
          amount: loan.originalPrincipal.toString(),
          startDate: isoFromDbDate(loan.startDate),
          monthlyInterestRate: loan.monthlyInterestRate.toString(),
          notes: loan.notes,
        },
        newValue: { ...parsed.data, annualInterestRate: annual },
      });
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not update this loan. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect(back(loan.partyId, asOf, "Loan updated. Interest was recalculated."));
}

export async function deleteLoan(formData: FormData) {
  const id = str(formData, "id");
  const asOf = str(formData, "asOf");
  const loan = await prisma.loanAccount.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!loan || loan.deletedAt) {
    redirect("/parties?notice=That loan could not be found.");
  }
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.loanAccount.update({ where: { id }, data: { deletedAt } });
    await tx.transaction.updateMany({
      where: { loanAccountId: id, deletedAt: null },
      data: { deletedAt },
    });
    await writeAudit(tx, {
      entityType: "LoanAccount",
      entityId: id,
      action: "DELETE",
      summary: `Removed ${loan.code} for ${loan.party.name}. It can be restored.`,
      previousValue: { code: loan.code, deletedAt: null },
      newValue: { deletedAt: deletedAt.toISOString() },
    });
  });
  revalidatePath("/", "layout");
  redirect(back(loan.partyId, asOf, "Loan removed. You can restore it from this page."));
}

export async function restoreLoan(formData: FormData) {
  const id = str(formData, "id");
  const asOf = str(formData, "asOf");
  const loan = await prisma.loanAccount.findUnique({ where: { id }, include: { party: true } });
  if (!loan) redirect("/parties?notice=That loan could not be found.");
  await prisma.$transaction(async (tx) => {
    await tx.loanAccount.update({ where: { id }, data: { deletedAt: null } });
    await tx.transaction.updateMany({
      where: { loanAccountId: id },
      data: { deletedAt: null },
    });
    await refreshLoanStatus(tx, id);
    await writeAudit(tx, {
      entityType: "LoanAccount",
      entityId: id,
      action: "RESTORE",
      summary: `Restored ${loan.code} for ${loan.party.name}.`,
    });
  });
  revalidatePath("/", "layout");
  redirect(back(loan.partyId, asOf, "Loan restored."));
}
