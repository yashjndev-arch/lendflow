"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";

export function PartyForm({
  action,
  asOf,
  submitLabel,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  asOf: string;
  submitLabel: string;
  initial?: {
    id?: string;
    name?: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="asOf" value={asOf} />
      {state.message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Field label="Party name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={initial?.name ?? ""} required className="h-10 bg-card" />
      </Field>
      <Field
        label="Mobile number"
        htmlFor="phone"
        error={state.fieldErrors?.phone}
        hint="Optional."
      >
        <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} className="h-10 bg-card" />
      </Field>
      <Field label="Address" htmlFor="address" error={state.fieldErrors?.address} hint="Optional.">
        <Textarea id="address" name="address" defaultValue={initial?.address ?? ""} />
      </Field>
      <Field label="Notes" htmlFor="notes" error={state.fieldErrors?.notes} hint="Optional.">
        <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
