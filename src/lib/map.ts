import { isoFromDbDate } from "./finance/dates";
import type { LedgerTransaction, PaymentType, TransactionType } from "./finance/interest";

export function mapTransaction(txn: {
  id: string;
  transactionType: string;
  paymentType: string | null;
  amount: { toString(): string };
  principalAmount: { toString(): string };
  interestAmount: { toString(): string };
  transactionDate: Date;
  notes: string | null;
  createdAt: Date;
}): LedgerTransaction {
  return {
    id: txn.id,
    transactionType: txn.transactionType as TransactionType,
    paymentType: (txn.paymentType as PaymentType | null) ?? null,
    amount: txn.amount.toString(),
    principalAmount: txn.principalAmount.toString(),
    interestAmount: txn.interestAmount.toString(),
    transactionDate: isoFromDbDate(txn.transactionDate),
    notes: txn.notes,
    createdAt: txn.createdAt.toISOString(),
  };
}
