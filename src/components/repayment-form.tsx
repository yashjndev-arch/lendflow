"use client";

import Decimal from "decimal.js";
import { useState } from "react";
import { useActionState } from "react";
import { controlClass, Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";
import { formatDisplayDate } from "@/lib/finance/dates";
import { previewRepayment, type LedgerTransaction } from "@/lib/finance/interest";
import { formatINR, formatPercent } from "@/lib/finance/money";

export interface RepaymentLoanOption {
  id: string;
  code: string;
  startDate: string;
  monthlyInterestRate: string;
  originalPrincipal: string;
  transactions: LedgerTransaction[];
}

export interface RepaymentPartyOption {
  id: string;
  name: string;
  code: string;
  loans: RepaymentLoanOption[];
}

export function RepaymentForm({
  action,
  asOf,
  parties,
  initialPartyId,
  dayCountBasis,
  symbol,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  asOf: string;
  parties: RepaymentPartyOption[];
  initialPartyId?: string;
  dayCountBasis: number;
  symbol: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const starting = parties.find((party) => party.id === initialPartyId) ?? parties[0];
  const [partyId, setPartyId] = useState(starting?.id ?? "");
  const [loanId, setLoanId] = useState(starting?.loans[0]?.id ?? "");
  const [paymentType, setPaymentType] = useState("PRINCIPAL");
  const [date, setDate] = useState(asOf);
  const [amount, setAmount] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");

  const party = parties.find((item) => item.id === partyId);
  const loans = party?.loans ?? [];
  const loan = loans.find((item) => item.id === loanId) ?? loans[0];

  const principalText = paymentType === "INTEREST" ? "0" : paymentType === "BOTH" ? principalAmount : amount;
  const interestText = paymentType === "PRINCIPAL" ? "0" : paymentType === "BOTH" ? interestAmount : amount;
  const amountPattern = /^\d+(\.\d{1,2})?$/;
  const amountsValid =
    (principalText === "" || amountPattern.test(principalText)) &&
    (interestText === "" || amountPattern.test(interestText));
  const preview = !loan || !date
    ? null
    : !amountsValid
      ? { ok: false as const, message: "Use numbers with up to 2 decimal places.", lines: null }
      : (() => {
          const result = previewRepayment({
            monthlyInterestRate: loan.monthlyInterestRate,
            startDate: loan.startDate,
            transactions: loan.transactions,
            dayCountBasis,
            repaymentDate: date,
            principalAmount: principalText || "0",
            interestAmount: interestText || "0",
            valuationDate: asOf,
          });
          return {
            ok: result.ok,
            message: result.message,
            lines: {
              outstandingBefore: formatINR(result.outstandingBefore, symbol),
              repayment: formatINR(
                new Decimal(result.repaymentPrincipal).plus(result.repaymentInterest),
                symbol,
              ),
              outstandingAfter: formatINR(result.outstandingAfter, symbol),
              accruedInterest: formatINR(result.accruedInterest, symbol),
              totalDue: formatINR(result.totalDue, symbol),
            },
          };
        })();

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <input type="hidden" name="asOf" value={asOf} />
      {state.message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Field label="Party" htmlFor="partyId" error={state.fieldErrors?.partyId}>
        <select
          id="partyId"
          name="partyId"
          value={partyId}
          onChange={(event) => {
            const nextParty = parties.find((item) => item.id === event.target.value);
            setPartyId(event.target.value);
            setLoanId(nextParty?.loans[0]?.id ?? "");
          }}
          required
          className={controlClass}
        >
          {parties.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.code}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Loan / account"
        htmlFor="loanAccountId"
        error={state.fieldErrors?.loanAccountId}
        hint={
          loan
            ? `Given ${formatINR(loan.originalPrincipal, symbol)} on ${formatDisplayDate(loan.startDate)} at ${formatPercent(loan.monthlyInterestRate)} monthly (${formatPercent(new Decimal(loan.monthlyInterestRate).mul(12))} a year).`
            : "Each advance keeps its own rate."
        }
      >
        <select
          id="loanAccountId"
          name="loanAccountId"
          value={loan?.id ?? ""}
          onChange={(event) => setLoanId(event.target.value)}
          required
          className={controlClass}
        >
          {loans.length === 0 ? <option value="">No open loans</option> : null}
          {loans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {formatINR(item.originalPrincipal, symbol)} · {formatPercent(item.monthlyInterestRate)} · {formatDisplayDate(item.startDate)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Repayment date" htmlFor="transactionDate" error={state.fieldErrors?.transactionDate}>
        <input
          id="transactionDate"
          name="transactionDate"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
          className={controlClass}
        />
      </Field>
      <Field
        label="Payment type"
        htmlFor="paymentType"
        hint="A normal receipt is principal only. Accrued interest stays visible until you record an interest payment."
      >
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
          <Field label="Principal portion" htmlFor="principalAmount" error={state.fieldErrors?.principalAmount}>
            <input
              id="principalAmount"
              name="principalAmount"
              inputMode="decimal"
              value={principalAmount}
              onChange={(event) => setPrincipalAmount(event.target.value)}
              className={controlClass + " num"}
            />
          </Field>
          <Field label="Interest portion" htmlFor="interestAmount" error={state.fieldErrors?.interestAmount}>
            <input
              id="interestAmount"
              name="interestAmount"
              inputMode="decimal"
              value={interestAmount}
              onChange={(event) => setInterestAmount(event.target.value)}
              className={controlClass + " num"}
            />
          </Field>
          <input type="hidden" name="amount" value="" />
        </div>
      ) : (
        <Field label="Amount received" htmlFor="amount" error={state.fieldErrors?.amount}>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            className={controlClass + " num"}
          />
          <input type="hidden" name="principalAmount" value="" />
          <input type="hidden" name="interestAmount" value="" />
        </Field>
      )}
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${preview && !preview.ok ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}
      >
        <p className="font-medium">Before saving</p>
        {preview?.lines ? (
          <dl className="mt-2 grid gap-1">
            <div className="flex justify-between gap-4">
              <dt>Outstanding principal before payment</dt>
              <dd className="num">{preview.lines.outstandingBefore}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Repayment amount</dt>
              <dd className="num">{preview.lines.repayment}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Outstanding principal after payment</dt>
              <dd className="num">{preview.lines.outstandingAfter}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Accrued interest as of this valuation</dt>
              <dd className="num">{preview.lines.accruedInterest}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Total due after this receipt</dt>
              <dd className="num">{preview.lines.totalDue}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-muted-foreground">Choose a loan to see the balance.</p>
        )}
        {preview?.message ? <p className="mt-2 text-destructive">{preview.message}</p> : null}
      </div>
      <Field label="Notes" htmlFor="notes" hint="Optional.">
        <Textarea id="notes" name="notes" />
      </Field>
      <div>
        <SubmitButton pendingLabel="Saving…">Save repayment</SubmitButton>
      </div>
    </form>
  );
}
