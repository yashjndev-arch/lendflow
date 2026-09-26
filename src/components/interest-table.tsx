import { Money } from "@/components/money";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayDate } from "@/lib/finance/dates";
import {
  formatHoldingDuration,
  LOAN_DURATION_HINT,
  PERIOD_DURATION_HINT,
} from "@/lib/finance/duration";
import type { InterestPeriod } from "@/lib/finance/interest";
import { formatINR, formatPercent } from "@/lib/finance/money";

export function InterestTable({
  periods,
  symbol,
  accrued,
  outstanding,
  totalDue,
  totalDuration,
}: {
  periods: InterestPeriod[];
  symbol: string;
  accrued: string;
  outstanding: string;
  totalDue: string;
  totalDuration: string;
}) {
  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead title={PERIOD_DURATION_HINT}>Duration</TableHead>
            <TableHead className="text-right">Principal</TableHead>
            <TableHead>Monthly rate</TableHead>
            <TableHead>Annual rate</TableHead>
            <TableHead className="text-right">Interest</TableHead>
            <TableHead className="hidden lg:table-cell">Formula</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-muted-foreground">
                No interest period falls on or before this date.
              </TableCell>
            </TableRow>
          ) : (
            periods.map((period) => (
              <TableRow key={period.period}>
                <TableCell className="num">{period.period}</TableCell>
                <TableCell className="num">{formatDisplayDate(period.from)}</TableCell>
                <TableCell>
                  <span className="num">{formatDisplayDate(period.to)}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {period.toInclusive ? "Included" : "Excluded"}
                  </span>
                </TableCell>
                <TableCell className="num text-right">{period.days}</TableCell>
                <TableCell className="num">
                  {formatHoldingDuration(period.from, period.endExclusive)}
                </TableCell>
                <TableCell className="text-right">
                  <Money value={period.principal} symbol={symbol} />
                </TableCell>
                <TableCell className="num">{formatPercent(period.monthlyRate)}</TableCell>
                <TableCell className="num">{formatPercent(period.annualRate)}</TableCell>
                <TableCell className="text-right">
                  <Money value={period.interest} symbol={symbol} />
                </TableCell>
                <TableCell className="hidden max-w-xs text-xs text-muted-foreground lg:table-cell">
                  {period.formula}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={8}>Total accrued interest</TableCell>
            <TableCell className="text-right">{formatINR(accrued, symbol)}</TableCell>
            <TableCell className="hidden lg:table-cell" />
          </TableRow>
        </TableFooter>
      </Table>
      <div className="grid gap-1 text-sm sm:ml-auto sm:min-w-80">
        <div className="flex justify-between gap-6">
          <span title={LOAN_DURATION_HINT}>Total duration</span>
          <span className="num text-right">{totalDuration}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>Total accrued interest</span>
          <Money value={accrued} symbol={symbol} />
        </div>
        <div className="flex justify-between gap-6">
          <span>Outstanding principal</span>
          <Money value={outstanding} symbol={symbol} tone="due" />
        </div>
        <div className="flex justify-between gap-6 border-t border-border pt-2 font-medium">
          <span>Grand total due</span>
          <Money value={totalDue} symbol={symbol} />
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        From is included. When the To date is a repayment, that day is excluded from the old
        principal and the reduced principal starts that day. The calculation date on the last
        period is included. Duration uses that same day count. Period interest is rounded for
        display; the total is rounded only after the exact period amounts are added, so the
        displayed rows can differ by a paisa.
      </p>
    </div>
  );
}
