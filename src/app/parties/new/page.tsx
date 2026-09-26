import { PartyForm } from "@/components/party-form";
import { PageHeader } from "@/components/page-header";
import { resolveAsOf } from "@/lib/finance/dates";
import { one } from "@/lib/search";
import { createParty } from "@/server/parties";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Add party" };

export default async function NewPartyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const asOf = resolveAsOf(one(params.asOf), settings.timezone);
  return (
    <div>
      <PageHeader
        title="Add party"
        description="A party can have several loans, each with its own amount, date, and monthly rate."
      />
      <PartyForm action={createParty} asOf={asOf} submitLabel="Save party" />
    </div>
  );
}
