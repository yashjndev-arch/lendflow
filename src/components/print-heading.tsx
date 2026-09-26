import { formatDisplayDate } from "@/lib/finance/dates";

export function PrintHeading({
  businessName,
  address,
  phone,
  title,
  asOf,
}: {
  businessName: string;
  address?: string | null;
  phone?: string | null;
  title: string;
  asOf: string;
}) {
  return (
    <div className="mb-6 hidden print:block">
      <p className="font-serif text-2xl">{businessName}</p>
      {address ? <p className="text-sm">{address}</p> : null}
      {phone ? <p className="text-sm">{phone}</p> : null}
      <p className="mt-3 text-base font-medium">{title}</p>
      <p className="text-sm">As of {formatDisplayDate(asOf)}</p>
    </div>
  );
}
