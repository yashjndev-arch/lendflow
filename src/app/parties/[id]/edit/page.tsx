import { notFound } from "next/navigation";
import { PartyForm } from "@/components/party-form";
import { PageHeader } from "@/components/page-header";
import { loadParty } from "@/lib/books";
import { resolveAsOf } from "@/lib/finance/dates";
import { one } from "@/lib/search";
import { getSettings } from "@/lib/settings";
import { updateParty } from "@/server/parties";

export const metadata = { title: "Edit party" };

export default async function EditPartyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const settings = await getSettings();
  const party = await loadParty(id, settings.dayCountBasis);
  if (!party) notFound();
  const asOf = resolveAsOf(one(query.asOf), settings.timezone);
  return (
    <div>
      <PageHeader title={`Edit ${party.name}`} description={`${party.code}. The ledger stays attached to this party.`} />
      <PartyForm
        action={updateParty}
        asOf={asOf}
        submitLabel="Save changes"
        initial={party}
      />
    </div>
  );
}
