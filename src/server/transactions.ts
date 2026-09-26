"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, invalid, str, type ActionState } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { compareISO, isoFromDbDate, parseISODate } from "@/lib/finance/dates";
import { ledgerError } from "@/lib/finance/interest";
import { annualRateFromMonthly, exact } from "@/lib/finance/money";
import { mapTransaction } from "@/lib/map";
import { refreshLoanStatus } from "@/lib/persist";
import { isoDateSchema, moneySchema, portionsFromRepayment, rateSchema } from "@/lib/validation";

function redirectTo(partyId: string, asOf: string, notice: string) {
  const params = new URLSearchParams({ notice });
  if (asOf) params.set("asOf", asOf);
  return `/parties/${partyId}?${params.toString()}`;
}

export async function updateTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = str(formData, "id");
  const asOf = str(formData, "asOf");
  const notes = str(formData, "notes");
  const transactionDate = str(formData, "transactionDate");
  if (!isoDateSchema.safeParse(transactionDate).success) {
    return invalid("Enter a valid date.", { transactionDate: "Enter a valid date." });
  }
  if (notes.length > 1000) {
    return invalid("Notes are too long.", { notes: "Keep notes to 1000 characters." });
  }

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: {
      loanAccount: { include: { transactions: true, party: true } },
    },
  });
  if (!txn || txn.deletedAt || txn.loanAccount.deletedAt) {
    return invalid("That transaction is no longer on the ledger.");
  }

  const live = txn.loanAccount.transactions.filter((row) => row.deletedAt === null);
  let amount = txn.amount.toString();
  let principalAmount = txn.principalAmount.toString();
  let interestAmount = txn.interestAmount.toString();
  let paymentType = txn.paymentType;
  let monthlyRate = txn.loanAccount.monthlyInterestRate.toString();
  let startDate = isoFromDbDate(txn.loanAccount.startDate);

  if (txn.transactionType === "LOAN_GIVEN") {
    const parsedAmount = moneySchema.safeParse(str(formData, "amount"));
    const parsedRate = rateSchema.safeParse(str(formData, "monthlyInterestRate"));
    const fieldErrors: Record<string, string> = {};
    if (!parsedAmount.success) fieldErrors.amount = fieldErrorsFrom(parsedAmount.error).form ?? parsedAmount.error.issues[0]?.message ?? "Enter an amount.";
    if (!parsedRate.success) fieldErrors.monthlyInterestRate = parsedRate.error.issues[0]?.message ?? "Enter a rate.";
    if (Object.keys(fieldErrors).length) {
      return invalid("Please correct the highlighted fields.", fieldErrors);
    }
    amount = str(formData, "amount");
    principalAmount = amount;
    interestAmount = "0";
    monthlyRate = str(formData, "monthlyInterestRate");
    startDate = transactionDate;
    const later = live.filter((row) => row.id !== txn.id);
    if (later.some((row) => compareISO(isoFromDbDate(row.transactionDate), startDate) < 0)) {
      return invalid("The date given cannot be after another transaction on this loan.");
    }
  } else {
    const type = str(formData, "paymentType");
    if (type !== "PRINCIPAL" && type !== "INTEREST" && type !== "BOTH") {
      return invalid("Choose what this receipt settles.", { paymentType: "Choose a payment type." });
    }
    paymentType = type;
    const check = type === "BOTH"
      ? [moneySchema.safeParse(str(formData, "principalAmount")), moneySchema.safeParse(str(formData, "interestAmount"))]
      : [moneySchema.safeParse(str(formData, "amount"))];
    if (check.some((item) => !item.success)) {
      return invalid("Enter an amount greater than zero, with up to 2 decimal places.");
    }
    if (compareISO(transactionDate, startDate) < 0) {
      return invalid("A repayment cannot be dated before the money was given.");
    }
    const portions = portionsFromRepayment({
      paymentType: type,
      amount: str(formData, "amount"),
      principalAmount: str(formData, "principalAmount"),
      interestAmount: str(formData, "interestAmount"),
    });
    amount = portions.amount;
    principalAmount = portions.principalAmount;
    interestAmount = portions.interestAmount;
  }

  const transactions = live.map(mapTransaction).map((row) =>
    row.id === txn.id
      ? {
          ...row,
          amount,
          principalAmount,
          interestAmount,
          paymentType,
          transactionDate,
          notes: notes || null,
        }
      : row,
  );
  const problem = ledgerError({
    monthlyInterestRate: monthlyRate,
    startDate,
    transactions,
  });
  if (problem) return invalid(problem);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
          amount,
          principalAmount,
          interestAmount,
          paymentType,
          transactionDate: parseISODate(transactionDate),
          notes: notes || null,
          transactionType:
            txn.transactionType === "LOAN_GIVEN"
              ? "LOAN_GIVEN"
              : new Decimal(principalAmount).isZero()
                ? "INTEREST_PAYMENT"
                : "REPAYMENT",
        },
      });
      if (txn.transactionType === "LOAN_GIVEN") {
        await tx.loanAccount.update({
          where: { id: txn.loanAccountId },
          data: {
            originalPrincipal: amount,
            startDate: parseISODate(transactionDate),
            monthlyInterestRate: monthlyRate,
            annualInterestRate: exact(annualRateFromMonthly(monthlyRate)),
            notes: notes || null,
          },
        });
      }
      await refreshLoanStatus(tx, txn.loanAccountId);
      await writeAudit(tx, {
        entityType: "Transaction",
        entityId: id,
        action: "UPDATE",
        summary: `Edited a transaction on ${txn.loanAccount.code}. Balances were recalculated.`,
        previousValue: {
          amount: txn.amount.toString(),
          principalAmount: txn.principalAmount.toString(),
          interestAmount: txn.interestAmount.toString(),
          paymentType: txn.paymentType,
          transactionDate: isoFromDbDate(txn.transactionDate),
          notes: txn.notes,
        },
        newValue: { amount, principalAmount, interestAmount, paymentType, transactionDate, notes },
      });
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not update the transaction. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect(redirectTo(txn.partyId, asOf, "Transaction updated. The ledger was recalculated."));
}

export async function deleteTransaction(formData: FormData) {
  const id = str(formData, "id");
  const asOf = str(formData, "asOf");
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { loanAccount: { include: { transactions: true } } },
  });
  if (!txn || txn.deletedAt) {
    redirect(`/transactions?notice=${encodeURIComponent("That transaction is already removed.")}`);
  }
  if (txn.transactionType === "LOAN_GIVEN") {
    const others = txn.loanAccount.transactions.filter(
      (row) => row.deletedAt === null && row.id !== txn.id,
    );
    if (others.length > 0) {
      redirect(
        redirectTo(
          txn.partyId,
          asOf,
          "Remove the later repayments first, or delete the whole loan.",
        ),
      );
    }
    redirect(
      redirectTo(
        txn.partyId,
        asOf,
        "Delete the loan from the party ledger if this advance was recorded by mistake.",
      ),
    );
  }
  const remaining = txn.loanAccount.transactions
    .filter((row) => row.deletedAt === null && row.id !== txn.id)
    .map(mapTransaction);
  const problem = ledgerError({
    monthlyInterestRate: txn.loanAccount.monthlyInterestRate.toString(),
    startDate: isoFromDbDate(txn.loanAccount.startDate),
    transactions: remaining,
  });
  if (problem) {
    redirect(redirectTo(txn.partyId, asOf, problem));
  }
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    await refreshLoanStatus(tx, txn.loanAccountId);
    await writeAudit(tx, {
      entityType: "Transaction",
      entityId: id,
      action: "DELETE",
      summary: `Removed a ${txn.transactionType.toLowerCase()} of ${txn.amount.toString()} from ${txn.loanAccount.code}.`,
      previousValue: {
        amount: txn.amount.toString(),
        date: isoFromDbDate(txn.transactionDate),
        paymentType: txn.paymentType,
      },
    });
  });
  revalidatePath("/", "layout");
  redirect(redirectTo(txn.partyId, asOf, "Transaction removed. You can restore it from Transactions."));
}

export async function restoreTransaction(formData: FormData) {
  const id = str(formData, "id");
  const asOf = str(formData, "asOf");
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { loanAccount: { include: { transactions: true } } },
  });
  if (!txn) {
    redirect("/transactions?notice=That transaction could not be found.");
  }
  if (txn.loanAccount.deletedAt) {
    redirect(redirectTo(txn.partyId, asOf, "Restore the loan before restoring this transaction."));
  }
  const restored = txn.loanAccount.transactions
    .filter((row) => row.deletedAt === null || row.id === txn.id)
    .map(mapTransaction);
  const problem = ledgerError({
    monthlyInterestRate: txn.loanAccount.monthlyInterestRate.toString(),
    startDate: isoFromDbDate(txn.loanAccount.startDate),
    transactions: restored,
  });
  if (problem) {
    redirect(redirectTo(txn.partyId, asOf, problem));
  }
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id }, data: { deletedAt: null } });
    await refreshLoanStatus(tx, txn.loanAccountId);
    await writeAudit(tx, {
      entityType: "Transaction",
      entityId: id,
      action: "RESTORE",
      summary: `Restored a transaction of ${txn.amount.toString()} on ${txn.loanAccount.code}.`,
    });
  });
  revalidatePath("/", "layout");
  redirect(redirectTo(txn.partyId, asOf, "Transaction restored. The ledger was recalculated."));
}
