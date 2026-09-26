import { writeAudit } from "./audit";
import { prisma } from "./db";
import { parseISODate } from "./finance/dates";
import { annualRateFromMonthly, exact } from "./finance/money";

async function ensureCounter(id: string, minimum: number) {
  const current = await prisma.counter.findUnique({ where: { id } });
  if (!current) {
    await prisma.counter.create({ data: { id, value: minimum } });
    return;
  }
  if (current.value < minimum) {
    await prisma.counter.update({ where: { id }, data: { value: minimum } });
  }
}

export async function seedDemo() {
  await prisma.appSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      businessName: "Party Loan & Interest",
      address: "Udupi, Karnataka",
      phone: "98450 00000",
    },
  });

  const parties = [
    {
      id: "party_a",
      code: "P-001",
      name: "Party A",
      phone: "98450 10001",
      address: "12 Temple Street, Udupi",
      notes: "Demo ledger with a partial repayment.",
    },
    {
      id: "party_b",
      code: "P-002",
      name: "Party B",
      phone: "98450 10002",
      address: "8 Market Road, Mangaluru",
      notes: "Demo ledger with no repayment yet.",
    },
    {
      id: "party_c",
      code: "P-003",
      name: "Party C",
      phone: "98450 10003",
      address: "4 Harbour Lane, Kundapura",
      notes: "Demo ledger opened in August.",
    },
  ];

  for (const party of parties) {
    await prisma.party.upsert({
      where: { id: party.id },
      update: {},
      create: party,
    });
  }

  const loans = [
    {
      id: "loan_a",
      code: "LN-001",
      partyId: "party_a",
      amount: "100.00",
      startDate: "2026-06-01",
      monthly: "1",
      notes: "Initial loan",
      txnId: "txn_a_given",
    },
    {
      id: "loan_b",
      code: "LN-002",
      partyId: "party_b",
      amount: "200.00",
      startDate: "2026-06-07",
      monthly: "2",
      notes: "Initial loan",
      txnId: "txn_b_given",
    },
    {
      id: "loan_c",
      code: "LN-003",
      partyId: "party_c",
      amount: "500.00",
      startDate: "2026-08-03",
      monthly: "1.75",
      notes: "Initial loan",
      txnId: "txn_c_given",
    },
  ];

  for (const loan of loans) {
    const annual = exact(annualRateFromMonthly(loan.monthly));
    await prisma.loanAccount.upsert({
      where: { id: loan.id },
      update: {},
      create: {
        id: loan.id,
        code: loan.code,
        partyId: loan.partyId,
        originalPrincipal: loan.amount,
        startDate: parseISODate(loan.startDate),
        monthlyInterestRate: loan.monthly,
        annualInterestRate: annual,
        notes: loan.notes,
        status: "ACTIVE",
      },
    });
    await prisma.transaction.upsert({
      where: { id: loan.txnId },
      update: {},
      create: {
        id: loan.txnId,
        loanAccountId: loan.id,
        partyId: loan.partyId,
        transactionType: "LOAN_GIVEN",
        amount: loan.amount,
        principalAmount: loan.amount,
        interestAmount: "0",
        transactionDate: parseISODate(loan.startDate),
        notes: loan.notes,
      },
    });
  }

  await prisma.transaction.upsert({
    where: { id: "txn_a_repay" },
    update: {},
    create: {
      id: "txn_a_repay",
      loanAccountId: "loan_a",
      partyId: "party_a",
      transactionType: "REPAYMENT",
      paymentType: "PRINCIPAL",
      amount: "50.00",
      principalAmount: "50.00",
      interestAmount: "0",
      transactionDate: parseISODate("2026-08-03"),
      notes: "Partial repayment",
    },
  });

  await ensureCounter("party", 3);
  await ensureCounter("loan", 3);

  const seeded = await prisma.auditLog.findFirst({ where: { entityId: "seed" } });
  if (!seeded) {
    await writeAudit(prisma, {
      entityType: "System",
      entityId: "seed",
      action: "CREATE",
      summary: "Loaded demo parties A, B, and C.",
      newValue: { parties: ["Party A", "Party B", "Party C"] },
    });
  }
}

export async function ensureDemoSeed() {
  const count = await prisma.party.count();
  if (count > 0) return;
  await seedDemo();
}
