import { Prisma, type PrismaClient } from "@prisma/client";
import { isoFromDbDate } from "./finance/dates";
import { deriveLoanStatus } from "./finance/interest";
import { mapTransaction } from "./map";

type Writer = Prisma.TransactionClient | PrismaClient;

export async function nextCode(db: Writer, kind: "party" | "loan") {
  const prefix = kind === "party" ? "P" : "LN";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const counter = await db.counter.upsert({
      where: { id: kind },
      create: { id: kind, value: 1 },
      update: { value: { increment: 1 } },
    });
    const code = `${prefix}-${String(counter.value).padStart(3, "0")}`;
    const existing =
      kind === "party"
        ? await db.party.findUnique({ where: { code } })
        : await db.loanAccount.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not allocate an account code.");
}

export async function refreshLoanStatus(db: Writer, loanId: string) {
  const loan = await db.loanAccount.findUnique({
    where: { id: loanId },
    include: { transactions: { where: { deletedAt: null } } },
  });
  if (!loan || loan.deletedAt) return;
  const status = deriveLoanStatus({
    monthlyInterestRate: loan.monthlyInterestRate.toString(),
    startDate: isoFromDbDate(loan.startDate),
    transactions: loan.transactions.map(mapTransaction),
  });
  if (loan.status !== status) {
    await db.loanAccount.update({ where: { id: loanId }, data: { status } });
  }
}
