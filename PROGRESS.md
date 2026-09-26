# Progress

Party Loan & Interest Management System. A single-user ledger for money given to parties, with day-wise simple interest rebuilt from the transaction history.

The app is running in development at [http://127.0.0.1:3847](http://127.0.0.1:3847).

## Architecture

Next.js App Router (TypeScript) serves the pages and a few route handlers. PostgreSQL stores the books. Prisma is the only database client. Money and rates are `DECIMAL` in the database and `decimal.js` in the calculation engine. JavaScript numbers are not used for financial arithmetic.

```
src/app/                  pages, loading/error states, API routes
src/components/           forms, shell, ledger tables
src/server/               server actions (parties, loans, repayments, edits, settings)
src/lib/finance/          dates, money formatting, interest engine, tests
src/lib/books.ts          load parties and value each loan as of a date
src/lib/dashboard.ts      summary cards and the party table
src/lib/reports.ts        report queries, CSV, SpreadsheetML Excel
prisma/schema.prisma      Party, LoanAccount, Transaction, AuditLog, AppSetting, Counter
```

Request flow:

1. The shell reads `asOf` from the query string. If it is missing, “today” is the calendar date in the settings timezone (`Asia/Kolkata` by default). That date is never hardcoded.
2. `books.ts` loads parties, loans, and live transactions (soft-deleted rows are excluded).
3. `calculateLoan` in `src/lib/finance/interest.ts` replays each loan’s ledger and returns outstanding principal, unrounded interest, periods, and a statement.
4. Pages format those decimals for display. Interest is not stored as a balance.

Data model:

| Model | Role |
|---|---|
| `Party` | Master record. `isActive` archives a party. `code` is `P-001` style. |
| `LoanAccount` | One advance: original principal, start date, monthly and annual rate, `ACTIVE`/`CLOSED`, `deletedAt`. |
| `Transaction` | Source of truth. Types: `LOAN_GIVEN`, `REPAYMENT`, `INTEREST_PAYMENT`, `ADJUSTMENT`. `paymentType` is `PRINCIPAL`, `INTEREST`, or `BOTH`. `principalAmount` and `interestAmount` are stored separately from `amount`. Dates are PostgreSQL `DATE`. |
| `AuditLog` | Actor, action, previous JSON, new JSON, timestamp. |
| `AppSetting` | Singleton: business name, address, phone, day count, currency, symbol, date format, timezone. |
| `Counter` | Next party and loan codes. |

Validation is Zod in `src/lib/validation.ts`. Server actions return `ActionState` (message plus field errors) instead of throwing into the form.

## What's done

- Party master: add, edit, search, view, archive. Parties that already have loans are archived rather than hard-deleted. Archived parties can be restored.
- Money given: one form per advance, its own amount, date, and monthly rate, with a live annual equivalent (`monthly × 12`).
- Repayments: party and loan, date, amount, payment type (default `PRINCIPAL`), notes, and a before/after principal preview. A principal receipt larger than the outstanding principal is rejected, including a backdated receipt that would make a later receipt too large.
- Multiple loans per party. Party totals sum the loans. Rates are not averaged into one party rate; the dashboard lists each distinct monthly rate.
- Dashboard cards: principal given, principal received, principal outstanding, interest accrued, amount receivable, active parties (parties with outstanding principal). Party table with Indian rupee formatting.
- Party ledger: balances, transaction history, per-loan interest breakdown (days, principal, rates, formula), and a party total.
- Calculate-as-of date on every screen, preserved while navigating.
- Reports: party outstanding, interest receivable, principal outstanding, payments received, transaction history, closed accounts, date range. Filters for party, from/to, status, and rate. Print layout, CSV, and Excel (SpreadsheetML).
- Settings for day count (365), INR, ₹, `DD/MM/YYYY`, business name, address, and phone. Recent audit rows are listed on the settings page.
- Edit and soft-delete for loans and transactions, with confirmation. Restore puts a removed row back. Edits rewrite the ledger, so later interest periods recalculate. The opening `LOAN_GIVEN` cannot be removed on its own while later transactions exist; the loan itself is deleted instead.
- Audit log on create, update, delete, and restore. Actor is the single-user placeholder `owner` in `src/lib/auth.ts`.
- Demo seed (development startup when there are no parties, and `npm run db:seed`): Party A ₹100 on 01/06/2026 at 1% with ₹50 repaid on 03/08/2026; Party B ₹200 on 07/06/2026 at 2%; Party C ₹500 on 03/08/2026 at 1.75%.
- Calculation tests in `src/lib/finance/interest.test.ts`: no repayment, one and many partial repayments, full repayment, several loans and rates, leap day, zero interest, historical as-of date, same-day repayment, repayment above principal, interest-only and mixed receipts, display rounding.
- `npm run lint` is clean on the committed tree. During implementation, `npm run typecheck`, `npm test`, and `npm run build` passed. The last code change after that full pass was the native rate and amount inputs plus an unused-import cleanup; lint was re-run after that cleanup.
- An earlier browser pass confirmed the dashboard, Party A’s ledger (63 days then 55 days, accrued ₹2.98, due ₹52.98), changing the as-of date, reports, settings, and a narrow mobile layout.

## What's left

- Confirm the two live previews in the browser after the input fix: typing `1.75` on Money Given shows annual `21%`, and a ₹10 principal receipt on Party A’s `LN-001` shows ₹50 before, ₹10 received, ₹40 after. ₹80 must show the exceeds-outstanding message. Those screens were wrong before the native-input change and have not been clicked again since the fix.
- Re-run `npm run typecheck`, `npm test`, and `npm run build` on the committed tree if a release check is required. They passed before the input fix; lint passed after it.
- Authentication. The audit actor is a constant. There is no login, session, or per-user permission.
- A generated PDF file. Reports have a print stylesheet and a print button. Export is CSV and SpreadsheetML, not a PDF library.
- A general undo stack. Restore of a soft-deleted loan or transaction is the undo that exists today.
- Production hosting, backups, and a process for applying migrations outside this machine.
- End-to-end tests for the forms and reports. Coverage is the calculation engine.

## Known bugs

- The monthly-rate and repayment-amount previews stayed stale when those fields used the shadcn `Input`. That component is Base UI `Field.Control`, which does not call React `onChange`. The rate, repayment date, and amount fields are now plain inputs with `onChange`. The fix is in the committed code. It has not been rechecked in the browser, so treat the preview as fixed in code and unverified on screen.
- Displayed period interest can be a paisa away from the total. For Party A as of 26/09/2026 the rows show ₹2.07 and ₹0.90, while the balance uses ₹2.98. That is the rounding rule (each row rounded for display, the total rounded once from the exact sum), not a second calculation. It is called out under the breakdown table so it is not mistaken for a missing paisa.
- Development logs can show a websocket error aimed at another port during hot reload. Page responses on port 3847 are unaffected.

## Key decisions

- **Ledger is the source of truth.** Accrued interest is computed by replaying transactions. It is not a stored running balance, so an edit or a new receipt changes every later figure.
- **Half-open periods.** Interest on a principal runs from the period start inclusive to the next principal-change date exclusive. The repayment date is charged only on the reduced principal. The statement date is inclusive, so the last period’s exclusive end is the day after the selected date.
- **Simple interest, monthly rate × 12, divisor 365.** A leap day counts in the numerator. The divisor stays the settings day count (default 365) even in a leap year. One decimal expression per period; days are not rounded one by one. Display is half-up to 2 decimal places.
- **Version 1 receipts are principal.** Interest stays outstanding until an interest receipt is recorded. `paymentType` and the split `principalAmount` / `interestAmount` columns are already in the schema, the engine, and the repayment form (`PRINCIPAL`, `INTEREST`, `BOTH`) so a later version does not need a migration to settle interest.
- **Interest receipts do not split a period.** Only a principal change opens a new interest period.
- **A party can have many loans.** Each advance has its own start date and rate. Party screens add the loans together.
- **Dates are date-only.** PostgreSQL `DATE` columns and `YYYY-MM-DD` strings in the engine. The UI prints `DD/MM/YYYY`. “Today” uses the settings timezone so a UTC conversion cannot move the business date.
- **Soft delete for financial rows.** Parties with loans are archived (`isActive`). Loans and transactions get `deletedAt` and can be restored. Calculations ignore removed rows.
- **Loan status follows the full ledger.** `CLOSED` means principal is fully repaid on the whole history. Report filters that say “closed as of this date” use the outstanding principal on the selected date instead.
- **Single user, audit-ready.** `currentActor` is `owner`. Every mutation already writes who, what, before, after, and when.
- **Decimal safety.** Prisma `Decimal` columns and `decimal.js` in `src/lib/finance`. Amount fields reject commas; formatting (`₹1,00,000.00`) happens only on output.

Party A as of 26/09/2026, from the same engine (`npm run demo -- 2026-09-26` and the unit test):

| | |
|---|---|
| Original principal | ₹100.00 on 01/06/2026 at 1% per month (12% a year) |
| Principal returned | ₹50.00 on 03/08/2026 |
| Outstanding principal | ₹50.00 |
| Period 1 | 01/06/2026 inclusive to 03/08/2026 exclusive, 63 days, `100 × 0.12 × 63/365 = 2.0712328767` → ₹2.07 |
| Period 2 | 03/08/2026 inclusive through 26/09/2026 inclusive, 55 days, `50 × 0.12 × 55/365 = 0.9041095890` → ₹0.90 |
| Accrued interest | exact sum `2.9753424658`, rounded once to ₹2.98 |
| Total due | ₹52.98 |
