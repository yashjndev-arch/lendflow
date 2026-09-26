import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That party or transaction is not on this ledger.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-4 h-10" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
