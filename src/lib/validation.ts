import Decimal from "decimal.js";
import { z } from "zod";
import { isIsoDate } from "./finance/dates";

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this to ${max} characters.`)
    .transform((value) => (value === "" ? null : value));

export const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isIsoDate(value), "Enter a valid date.");

export const moneySchema = z.string().trim().refine((value) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
  try {
    return new Decimal(value).gt(0);
  } catch {
    return false;
  }
}, "Enter an amount greater than zero, with up to 2 decimal places and no commas.");

export const rateSchema = z.string().trim().refine((value) => {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return false;
  try {
    const rate = new Decimal(value);
    return rate.gte(0) && rate.lte(100);
  } catch {
    return false;
  }
}, "Enter a monthly interest rate from 0 to 100. For example, 1.75.");

export const phoneSchema = z
  .string()
  .trim()
  .max(20, "Mobile number is too long.")
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || /^[+0-9][0-9\s-]{7,18}$/.test(value),
    "Enter a valid mobile number, or leave it blank.",
  );

export const partySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Party name is required.")
    .max(120, "Party name is too long."),
  phone: phoneSchema,
  address: optionalText(500),
  notes: optionalText(1000),
});

export const loanSchema = z.object({
  partyId: z.string().trim().min(1, "Select a party."),
  amount: moneySchema,
  startDate: isoDateSchema,
  monthlyInterestRate: rateSchema,
  notes: optionalText(1000),
});

export const repaymentSchema = z
  .object({
    partyId: z.string().trim().min(1, "Select a party."),
    loanAccountId: z.string().trim().min(1, "Select the loan this repayment belongs to."),
    transactionDate: isoDateSchema,
    paymentType: z.enum(["PRINCIPAL", "INTEREST", "BOTH"]),
    amount: z.string().trim(),
    principalAmount: z.string().trim(),
    interestAmount: z.string().trim(),
    notes: optionalText(1000),
  })
  .superRefine((data, ctx) => {
    const check = (value: string, path: string, label: string) => {
      const parsed = moneySchema.safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: parsed.error.issues[0]?.message ?? `Enter ${label}.`,
        });
        return false;
      }
      return true;
    };

    if (data.paymentType === "BOTH") {
      check(data.principalAmount, "principalAmount", "the principal portion");
      check(data.interestAmount, "interestAmount", "the interest portion");
    } else {
      check(data.amount, "amount", "the amount received");
    }
  });

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required.").max(160),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(40),
  dayCountBasis: z.coerce
    .number()
    .int("Day count must be a whole number.")
    .min(1, "Day count must be at least 1.")
    .max(366, "Day count cannot be more than 366."),
  currency: z.string().trim().min(1).max(8),
  currencySymbol: z.string().trim().min(1).max(4),
  dateFormat: z.string().trim().min(1).max(20),
  timezone: z.string().trim().min(1, "Timezone is required.").max(64),
});

export function portionsFromRepayment(input: {
  paymentType: "PRINCIPAL" | "INTEREST" | "BOTH";
  amount: string;
  principalAmount: string;
  interestAmount: string;
}): { amount: string; principalAmount: string; interestAmount: string } {
  if (input.paymentType === "PRINCIPAL") {
    return { amount: input.amount, principalAmount: input.amount, interestAmount: "0" };
  }
  if (input.paymentType === "INTEREST") {
    return { amount: input.amount, principalAmount: "0", interestAmount: input.amount };
  }
  const total = new Decimal(input.principalAmount).plus(input.interestAmount);
  return {
    amount: total.toFixed(2),
    principalAmount: new Decimal(input.principalAmount).toFixed(2),
    interestAmount: new Decimal(input.interestAmount).toFixed(2),
  };
}
