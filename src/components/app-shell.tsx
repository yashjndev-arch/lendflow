"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/money-given", label: "Money Given", icon: Wallet },
  { href: "/repayments", label: "Repayments", icon: Banknote },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  onNavigate,
  asOf,
}: {
  onNavigate?: () => void;
  asOf: string | null;
}) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1 px-3">
      {links.map((link) => {
        const Icon = link.icon;
        const active = isActive(pathname, link.href);
        const href = asOf ? `${link.href}?asOf=${asOf}` : link.href;
        return (
          <Link
            key={link.href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AsOfPicker({ today }: { today: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const current = params.get("asOf") || today;

  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label htmlFor="as-of" className="text-[11px] font-medium text-muted-foreground">
        Calculate balance as of
      </label>
      <div className="flex items-center gap-2">
        <input
          id="as-of"
          type="date"
          value={current}
          max="9999-12-31"
          onChange={(event) => {
            const next = new URLSearchParams(params.toString());
            next.set("asOf", event.target.value);
            router.push(`${pathname}?${next.toString()}`);
          }}
          className="h-9 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {formatDisplayDate(current)}
        </span>
      </div>
    </form>
  );
}

export function AppShell({
  businessName,
  today,
  children,
}: {
  businessName: string;
  today: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
          <Link href="/" className="block px-4 py-5">
            <p className="font-serif text-2xl leading-tight">{businessName}</p>
            <p className="mt-1 text-xs text-muted-foreground">Day-wise simple interest</p>
          </Link>
          <Suspense fallback={null}>
            <AsOfNav />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
            <MobileNav businessName={businessName} />
            <div className="min-w-0 flex-1 md:hidden">
              <p className="truncate font-serif text-lg leading-none">{businessName}</p>
            </div>
            <div className="ml-auto">
              <Suspense fallback={<div className="h-9 w-40" />}>
                <AsOfPicker today={today} />
              </Suspense>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function AsOfNav() {
  const params = useSearchParams();
  return <NavLinks asOf={params.get("asOf")} />;
}

function MobileNav({ businessName }: { businessName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="icon" className="md:hidden" />}
      >
        <Menu />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">{businessName}</SheetTitle>
        </SheetHeader>
        <Suspense fallback={null}>
          <MobileLinks onNavigate={() => setOpen(false)} />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
}

function MobileLinks({ onNavigate }: { onNavigate: () => void }) {
  const params = useSearchParams();
  return <NavLinks asOf={params.get("asOf")} onNavigate={onNavigate} />;
}
