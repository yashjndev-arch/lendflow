"use client";

import Decimal from "decimal.js";
import { useMemo, useState } from "react";
import { useActionState } from "react";
import { controlClass, Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";
import { formatPercent } from "@/lib/finance/money";

export function LoanForm({
  action,
  asOf,
  parties,
  submitLabel,
  lockParty,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  asOf: string;
  parties: { id: string; name: string; code: string }[];
  submitLabel: string;
  lockParty?: boolean;
  initial?: {
    id?: string;
    partyId?: string;
    amount?: string;
    startDate?: string;
    monthlyInterestRate?: string;
    notes?: string | null;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [rate, setRate] = useState(initial?.monthlyInterestRate ?? "");
  const annual = useMemo(() => {
    try {
      if (!rate.trim()) return null;
      return new Decimal(rate).mul(12);
    } catch {
      return null;
    }
  }, [rate]);

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
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
          defaultValue={initial?.partyId ?? ""}
          required
          disabled={lockParty}
          className={controlClass}
        >
          <option value="">Select a party</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name} · {party.code}
            </option>
          ))}
        </select>
        {lockParty && initial?.partyId ? (
          <input type="hidden" name="partyId" value={initial.partyId} />
        ) : null}
      </Field>
      <Field
        label="Amount"
        htmlFor="amount"
        error={state.fieldErrors?.amount}
        hint="Rupees, up to 2 decimal places. Do not use commas."
      >
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          defaultValue={initial?.amount ?? ""}
          required
          className="h-10 bg-card num"
        />
      </Field>
      <Field
        label="Date given"
        htmlFor="startDate"
        error={state.fieldErrors?.startDate}
        hint="Shown everywhere as DD/MM/YYYY."
      >
        <Input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={initial?.startDate ?? asOf}
          required
          className="h-10 bg-card"
        />
      </Field>
      <Field
        label="Monthly interest rate"
        htmlFor="monthlyInterestRate"
        error={state.fieldErrors?.monthlyInterestRate}
        hint="Enter 1 for 1% per month. Decimals such as 1.75 are allowed."
      >
        <input
          id="monthlyInterestRate"
          name="monthlyInterestRate"
          inputMode="decimal"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          required
          className={controlClass + " num"}
        />
      </Field>
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <p>
          Monthly rate:{" "}
          <span className="num font-medium">
            {annual ? formatPercent(rate) : "—"}
          </span>
        </p>
        <p>
          Annual equivalent:{" "}
          <span className="num font-medium">
            {annual ? formatPercent(annual) : "—"}
          </span>
        </p>
      </div>
      <Field label="Description / notes" htmlFor="notes" error={state.fieldErrors?.notes} hint="Optional.">
        <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
