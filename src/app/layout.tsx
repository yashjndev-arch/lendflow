import type { Metadata } from "next";
import { Figtree, Newsreader } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { todayISO } from "@/lib/finance/dates";
import { getSettings } from "@/lib/settings";
import "./globals.css";

const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: {
    default: "Party Loan & Interest",
    template: "%s · Party Loan & Interest",
  },
  description:
    "Track money given to parties, day-wise simple interest, and repayments.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let businessName = "Party Loan & Interest";
  let today = todayISO();
  let dbError: string | null = null;
  try {
    const settings = await getSettings();
    businessName = settings.businessName;
    today = todayISO(settings.timezone);
  } catch (error) {
    console.error(error);
    dbError =
      "The database is not ready. Create it, then run npm run db:deploy and npm run db:seed.";
  }

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full">
        {dbError ? (
          <main className="mx-auto max-w-lg px-6 py-16">
            <h1 className="font-serif text-3xl">Database not ready</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{dbError}</p>
          </main>
        ) : (
          <AppShell businessName={businessName} today={today}>
            {children}
          </AppShell>
        )}
      </body>
    </html>
  );
}
