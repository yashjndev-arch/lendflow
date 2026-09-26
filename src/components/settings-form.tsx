"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";

export function SettingsForm({
  action,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: {
    businessName: string;
    address: string;
    phone: string;
    dayCountBasis: number;
    currency: string;
    currencySymbol: string;
    dateFormat: string;
    timezone: string;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      {state.message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Field label="Business name" htmlFor="businessName" error={state.fieldErrors?.businessName}>
        <Input id="businessName" name="businessName" defaultValue={initial.businessName} className="h-10 bg-card" />
      </Field>
      <Field label="Address" htmlFor="address" hint="Printed at the top of statements.">
        <Textarea id="address" name="address" defaultValue={initial.address} />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={initial.phone} className="h-10 bg-card" />
      </Field>
      <Field
        label="Day count"
        htmlFor="dayCountBasis"
        error={state.fieldErrors?.dayCountBasis}
        hint="Standard is 365. Interest = principal × annual rate × days ÷ day count."
      >
        <Input
          id="dayCountBasis"
          name="dayCountBasis"
          type="number"
          min={1}
          max={366}
          defaultValue={initial.dayCountBasis}
          className="h-10 bg-card num"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency" htmlFor="currency">
          <Input id="currency" name="currency" defaultValue={initial.currency} className="h-10 bg-card" />
        </Field>
        <Field label="Currency symbol" htmlFor="currencySymbol">
          <Input id="currencySymbol" name="currencySymbol" defaultValue={initial.currencySymbol} className="h-10 bg-card" />
        </Field>
      </div>
      <Field label="Date format" htmlFor="dateFormat" hint="Dates are displayed as DD/MM/YYYY.">
        <Input id="dateFormat" name="dateFormat" defaultValue={initial.dateFormat} className="h-10 bg-card" />
      </Field>
      <Field label="Timezone for “today”" htmlFor="timezone" error={state.fieldErrors?.timezone}>
        <Input id="timezone" name="timezone" defaultValue={initial.timezone} className="h-10 bg-card" />
      </Field>
      <div>
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
