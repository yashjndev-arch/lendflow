"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "default",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "destructive" | "outline" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className="h-10 px-4">
      {pending ? pendingLabel : children}
    </Button>
  );
}
