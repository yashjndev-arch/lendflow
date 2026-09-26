/**
 * Calendar dates for the ledger.
 *
 * Financial dates are date-only. They are stored as PostgreSQL DATE values and
 * handled here as `YYYY-MM-DD` strings. Day arithmetic uses UTC midnight so a
 * date never shifts by one day because of a timezone offset.
 *
 * "Today" follows the business timezone (default Asia/Kolkata), not the
 * server's UTC date.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  try {
    parseISODate(value);
    return true;
  } catch {
    return false;
  }
}

export function parseISODate(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new Error(`Invalid date: ${iso}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return date;
}

export function dateToISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Prisma `@db.Date` values come back as UTC midnight. */
export function isoFromDbDate(date: Date): string {
  return dateToISO(date);
}

export function formatTimestamp(date: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

export function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function compareISO(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Calendar days from `start` inclusive to `end` exclusive. */
export function daysBetween(start: string, end: string): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToISO(date);
}

export function todayISO(
  timeZone = "Asia/Kolkata",
  now = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Could not resolve today's date.");
  }
  return `${year}-${month}-${day}`;
}

export function resolveAsOf(
  input: string | undefined,
  timeZone = "Asia/Kolkata",
  now = new Date(),
): string {
  if (input && isIsoDate(input)) return input;
  return todayISO(timeZone, now);
}

/** Indian financial year starts on 1 April. */
export function indianFinancialYearStart(asOf: string): string {
  const [yearText, monthText] = asOf.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-04-01`;
}
