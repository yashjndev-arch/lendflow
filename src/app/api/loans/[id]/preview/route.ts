import Decimal from "decimal.js";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isoFromDbDate, isIsoDate, resolveAsOf } from "@/lib/finance/dates";
import { previewRepayment } from "@/lib/finance/interest";
import { formatINR } from "@/lib/finance/money";
import { mapTransaction } from "@/lib/map";
import { getSettings } from "@/lib/settings";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  if (!isIsoDate(date)) {
    return NextResponse.json(
      { ok: false, message: "Enter a valid repayment date." },
      { status: 400 },
    );
  }
  const settings = await getSettings();
  const loan = await prisma.loanAccount.findUnique({
    where: { id },
    include: { transactions: { where: { deletedAt: null } } },
  });
  if (!loan || loan.deletedAt) {
    return NextResponse.json({ ok: false, message: "That loan could not be found." }, { status: 404 });
  }
  const readPortion = (key: string) => {
    const raw = url.searchParams.get(key) || "0";
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    return raw;
  };
  const principal = readPortion("principal");
  const interest = readPortion("interest");
  if (principal === null || interest === null) {
    return NextResponse.json(
      { ok: false, message: "Enter amounts with up to 2 decimal places." },
      { status: 400 },
    );
  }
  const preview = previewRepayment({
    monthlyInterestRate: loan.monthlyInterestRate.toString(),
    startDate: isoFromDbDate(loan.startDate),
    transactions: loan.transactions.map(mapTransaction),
    dayCountBasis: settings.dayCountBasis,
    repaymentDate: date,
    principalAmount: principal,
    interestAmount: interest,
    valuationDate: resolveAsOf(url.searchParams.get("asOf") ?? undefined, settings.timezone),
  });
  const symbol = settings.currencySymbol;
  return NextResponse.json({
    ok: preview.ok,
    message: preview.message,
    outstandingBefore: formatINR(preview.outstandingBefore, symbol),
    outstandingAfter: formatINR(preview.outstandingAfter, symbol),
    repayment: formatINR(
      new Decimal(preview.repaymentPrincipal).plus(preview.repaymentInterest),
      symbol,
    ),
    accruedInterest: formatINR(preview.accruedInterest, symbol),
    totalDue: formatINR(preview.totalDue, symbol),
  });
}
