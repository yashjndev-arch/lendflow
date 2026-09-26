"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="font-serif text-3xl">Something went wrong</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The ledger could not be loaded. Your saved transactions were not changed.
      </p>
      <Button type="button" className="mt-4 h-10" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
