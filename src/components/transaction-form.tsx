"use client";

import { useState } from "react";
import { useActionState } from "react";
import { controlClass, Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";

export function TransactionForm({
  action,
  asOf,
  transaction,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  asOf: string;
  transaction: {
    id: string;
    transactionType: string;
    paymentType: string | null;
    amount: string;
    principalAmount: string;
    interestAmount: string;
    transactionDate: string;
    notes: string | null;
    monthlyInterestRate: string;
    loanCode: string;
    partyName: string;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [paymentType, setPaymentType] = useState(transaction.paymentType ?? "PRINCIPAL");
  const isDisbursement = transaction.transactionType === "LOAN_GIVEN";

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <input type="hidden" name="id" value={transaction.id} />
      <input type="hidden" name="asOf" value={asOf} />
      <p className="text-sm text-muted-foreground">
        {transaction.partyName} · {transaction.loanCode}. Saving recalculates every later balance.
      </p>
      {state.message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Field label="Date" htmlFor="transactionDate" error={state.fieldErrors?.transactionDate}>
        <Input
          id="transactionDate"
          name="transactionDate"
          type="date"
          defaultValue={transaction.transactionDate}
          required
          className="h-10 bg-card"
        />
      </Field>
      {isDisbursement ? (
        <>
          <Field label="Amount" htmlFor="amount" error={state.fieldErrors?.amount}>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={transaction.amount}
              required
              className="h-10 bg-card num"
            />
          </Field>
          <Field
            label="Monthly interest rate"
            htmlFor="monthlyInterestRate"
            error={state.fieldErrors?.monthlyInterestRate}
            hint="Changing the rate recalculates interest for the whole loan."
          >
            <Input
              id="monthlyInterestRate"
              name="monthlyInterestRate"
              inputMode="decimal"
              defaultValue={transaction.monthlyInterestRate}
              required
              className="h-10 bg-card num"
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Payment type" htmlFor="paymentType">
            <select
              id="paymentType"
              name="paymentType"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              className={controlClass}
            >
              <option value="PRINCIPAL">Principal</option>
              <option value="INTEREST">Interest</option>
              <option value="BOTH">Principal + interest</option>
            </select>
          </Field>
          {paymentType === "BOTH" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Principal portion" htmlFor="principalAmount">
                <Input
                  id="principalAmount"
                  name="principalAmount"
                  defaultValue={transaction.principalAmount}
                  className="h-10 bg-card num"
                />
              </Field>
              <Field label="Interest portion" htmlFor="interestAmount">
                <Input
                  id="interestAmount"
                  name="interestAmount"
                  defaultValue={transaction.interestAmount}
                  className="h-10 bg-card num"
                />
              </Field>
            </div>
          ) : (
            <Field label="Amount" htmlFor="amount">
              <Input
                id="amount"
                name="amount"
                defaultValue={transaction.amount}
                className="h-10 bg-card num"
              />
            </Field>
          )}
        </>
      )}
      <Field label="Notes" htmlFor="notes" error={state.fieldErrors?.notes}>
        <Textarea id="notes" name="notes" defaultValue={transaction.notes ?? ""} />
      </Field>
      <div>
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}
