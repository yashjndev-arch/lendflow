import { NextResponse } from "next/server";
import { loadParties } from "@/lib/books";
import {
  buildReport,
  exportFilename,
  reportQueryFrom,
  reportToCsv,
  reportToExcel,
} from "@/lib/reports";
import { getSettings } from "@/lib/settings";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = await getSettings();
  const query = reportQueryFrom(
    {
      kind: url.searchParams.get("kind") ?? undefined,
      asOf: url.searchParams.get("asOf") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      partyId: url.searchParams.get("partyId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      rate: url.searchParams.get("rate") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
    },
    settings,
  );
  const parties = await loadParties(settings.dayCountBasis);
  const report = buildReport(parties, query);
  const format = url.searchParams.get("format") === "xls" ? "xls" : "csv";
  const filename = exportFilename(query.kind, query.asOf, format);
  if (format === "xls") {
    return new NextResponse(reportToExcel(report), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  return new NextResponse(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
