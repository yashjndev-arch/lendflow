# Party Loan & Interest Management System

A ledger for money given to parties. It calculates day-wise simple interest, records partial and full repayments, and shows outstanding principal, accrued interest, and the total due.

Interest is never stored as a running balance. The transaction ledger is the source of truth, and every screen recalculates from it.

## Interest rule

Rates entered in the app are **monthly**.

```
annual rate = monthly rate × 12
interest    = principal × (annual rate / 100) × (days / 365)
```

This is simple interest, not compound interest. A whole period is calculated in one decimal expression. Days are not rounded one by one. Money is rounded half-up to paise only when it is displayed.

Day count:

- A period runs from its start date **inclusive** to its end date **exclusive**.
- On a repayment date, interest stops on the old principal. That date is not charged twice.
- From the repayment date onward, interest uses the reduced principal.
- A statement “as of” a date **includes** that calendar date. The last period therefore runs through the selected day.
- 29 February counts as a day. The divisor stays 365 unless you change the day-count setting.

Worked example for Party A as of 26/09/2026 (the engine produces these figures; `npm test` locks them):

| | |
|---|---|
| Original principal | ₹100.00 given on 01/06/2026 at 1% per month (12% a year) |
| Principal returned | ₹50.00 on 03/08/2026 |
| Outstanding principal | ₹50.00 |

Period 1: 01/06/2026 inclusive to 03/08/2026 exclusive = **63 days** on ₹100.

```
100 × 12% × 63/365 = 2.0712328767  →  ₹2.07
```

Period 2: 03/08/2026 inclusive to 26/09/2026 inclusive = **55 days** on ₹50.

```
50 × 12% × 55/365 = 0.9041095890  →  ₹0.90
```

Total accrued interest is the sum of the exact period amounts, then rounded: **₹2.98**.  
Total due = ₹50.00 + ₹2.98 = **₹52.98**.

The two displayed period amounts (₹2.07 + ₹0.90) are a paisa lower than the total because each row is rounded on its own. The total is the one used for the balance.

## Stack

- Next.js, React, TypeScript
- Tailwind CSS and shadcn/ui
- PostgreSQL and Prisma
- Zod validation
- decimal.js for every money and interest calculation
- Vitest for the calculation engine

## Local setup

Requirements: Node.js 20 or newer, and PostgreSQL 14 or newer.

1. Create the database and user:

```sql
CREATE USER partyloan WITH PASSWORD 'partyloan';
CREATE DATABASE party_loan OWNER partyloan;
```

2. Copy the environment file and adjust the connection string if needed:

```bash
cp .env.example .env
```

3. Install, migrate, and seed:

```bash
npm install
npm run db:deploy
npm run db:seed
```

In development, the first server start also loads the demo parties when the database has no parties yet.

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3847](http://localhost:3847).

Demo data:

| Party | Given | Date | Monthly rate | Repayment |
|---|---|---|---|---|
| Party A | ₹100 | 01/06/2026 | 1% | ₹50 on 03/08/2026 |
| Party B | ₹200 | 07/06/2026 | 2% | none |
| Party C | ₹500 | 03/08/2026 | 1.75% | none |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on port 3847 |
| `npm test` | Financial calculation tests |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run db:migrate` | Create a new migration during development |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Load demo parties |
| `npm run demo` | Print Party A’s calculation as of today |

`npm run demo -- 2026-09-26` prints the worked example above.

## Dates and money

- Enter dates with the calendar control. Every date on screen is `DD/MM/YYYY`.
- Database columns are PostgreSQL `DATE` values, not timestamps, so a date does not shift by a day.
- “Today” uses the timezone in Settings (default `Asia/Kolkata`).
- Amounts use Indian grouping, for example `₹1,00,000.00`.
- Do not type commas into amount fields.

## Repayments

The normal receipt is **principal only**. Accrued interest stays outstanding. The payment type field also accepts `INTEREST` and `BOTH`, so a later version can settle interest without a schema change. A principal receipt cannot exceed the outstanding principal, including when it is backdated ahead of a later receipt.

## Parties and edits

Parties with loans are archived rather than deleted. Loans and transactions are soft-deleted and can be restored. Every create, edit, delete, and restore writes an audit row (actor, previous value, new value, time). The app is single-user today; `src/lib/auth.ts` is the place to plug in a real login. The actor name is what the audit log stores.
