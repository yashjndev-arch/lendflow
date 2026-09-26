import { NextResponse } from "next/server";
import { loadParty } from "@/lib/books";
import { formatDisplayDate } from "@/lib/finance/dates";
import { formatINR, formatPercent } from "@/lib/finance/money";
import { getSettings } from "@/lib/settings";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const settings = await getSettings();
  const party = await loadParty(id, settings.dayCountBasis);
  if (!party || !party.isActive) {
    return NextResponse.json({ loans: [] });
  }
  return NextResponse.json({
    loans: party.loans.map((loan) => ({
      id: loan.id,
      code: loan.code,
      startDate: loan.startDate,
      startLabel: formatDisplayDate(loan.startDate),
      rateLabel: formatPercent(loan.monthlyInterestRate),
      annualLabel: formatPercent(loan.annualInterestRate),
      amountLabel: formatINR(loan.originalPrincipal, settings.currencySymbol),
    })),
  });
}
