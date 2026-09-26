import Decimal from "decimal.js";

/**
 * Money is kept as decimal strings until the final display rounding.
 * Never pass a monetary amount through a JavaScript number.
 */

export function D(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function exact(value: Decimal): string {
  return value.toFixed();
}

export function roundMoney(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function moneyEqual(a: Decimal.Value, b: Decimal.Value): boolean {
  return new Decimal(a).eq(new Decimal(b));
}

function groupIndianDigits(integer: string): string {
  if (integer.length <= 3) return integer;
  const head = integer.slice(0, -3);
  const tail = integer.slice(-3);
  const groupedHead = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${groupedHead},${tail}`;
}

/** ₹1,00,000.00 — half-up to 2 decimal places, Indian grouping. */
export function formatINR(
  value: Decimal.Value,
  symbol = "₹",
): string {
  const rounded = roundMoney(value);
  const negative = rounded.isNegative();
  const [integer, fraction] = rounded.abs().toFixed(2).split(".");
  return `${negative ? "-" : ""}${symbol}${groupIndianDigits(integer)}.${fraction}`;
}

/** Plain 2-decimal number for CSV/Excel, still half-up and decimal-safe. */
export function formatPlainMoney(value: Decimal.Value): string {
  return roundMoney(value).toFixed(2);
}

export function formatPercent(value: Decimal.Value): string {
  const fixed = new Decimal(value)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    .toFixed(4);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return `${trimmed}%`;
}

export function annualRateFromMonthly(monthlyRate: Decimal.Value): Decimal {
  return new Decimal(monthlyRate).mul(12);
}

export function sumExact(values: Decimal.Value[]): string {
  return values
    .reduce<Decimal>((total, value) => total.plus(value), new Decimal(0))
    .toFixed();
}
