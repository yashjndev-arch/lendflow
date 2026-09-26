import { formatINR } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export function Money({
  value,
  symbol = "₹",
  tone,
  className,
}: {
  value: string;
  symbol?: string;
  tone?: "given" | "received" | "due";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "num whitespace-nowrap",
        tone === "given" && "text-given",
        tone === "received" && "text-received",
        tone === "due" && "text-due",
        className,
      )}
    >
      {formatINR(value, symbol)}
    </span>
  );
}
