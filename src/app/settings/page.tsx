import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { formatTimestamp } from "@/lib/finance/dates";
import { prisma } from "@/lib/db";
import { one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { currentActor } from "@/lib/auth";
import { updateSettings } from "@/server/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const audit = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  return (
    <div>
      <Flash message={one(params.notice)} />
      <PageHeader
        title="Settings"
        description="These details appear on printed statements. The calculation date defaults to today in the business timezone and can be changed from the header."
      />
      <p className="mb-4 max-w-xl text-sm text-muted-foreground">
        Signed in as {currentActor}. This copy is single-user. The audit log already records who changed each entry, so a login can be added later without rewriting the ledger.
      </p>
      <SettingsForm
        action={updateSettings}
        initial={{
          businessName: settings.businessName,
          address: settings.address,
          phone: settings.phone,
          dayCountBasis: settings.dayCountBasis,
          currency: settings.currency,
          currencySymbol: settings.currencySymbol,
          dateFormat: settings.dateFormat,
          timezone: settings.timezone,
        }}
      />
      <section className="mt-10 max-w-3xl">
        <h2 className="font-serif text-2xl">Recent changes</h2>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {audit.map((entry) => (
              <li key={entry.id} className="px-4 py-3 text-sm">
                <p>{entry.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.actor} · {entry.action} · {entry.entityType} · {formatTimestamp(entry.createdAt, settings.timezone)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
