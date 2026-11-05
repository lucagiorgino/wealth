"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ChartNoAxesColumn,
  ChartNoAxesCombined,
  LayoutDashboard,
  LockKeyhole,
  Tags,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultSidebarOrder, sidebarPages } from "@/lib/settings";

const icons = {
  dashboard: LayoutDashboard,
  wallets: Wallet,
  transactions: ArrowLeftRight,
  summary: ChartNoAxesColumn,
  comparison: ChartNoAxesCombined,
  categories: Tags,
};

export function AppSidebar({
  accountMenu,
  sidebarOrder = defaultSidebarOrder,
  settingsFailure,
}) {
  const pathname = usePathname();
  const pages = sidebarOrder.map((id) => ({
    ...sidebarPages.find((page) => page.id === id),
    icon: icons[id],
  }));

  return (
    <aside
      aria-label="Sidebar"
      className="sticky top-0 z-30 grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b bg-sidebar px-4 py-3 text-sidebar-foreground md:flex md:h-dvh md:w-60 md:flex-col md:items-stretch md:gap-8 md:overflow-y-auto md:border-r md:border-b-0 md:px-4 md:py-6 lg:w-64 lg:px-5"
    >
      <Link
        href="/dashboard"
        className="flex min-h-11 w-fit items-center gap-2.5 rounded-lg text-xl font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:px-2"
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground"
        >
          W
        </span>
        Wealth<span className="sr-only"> dashboard</span>
      </Link>
      <nav
        aria-label="Main navigation"
        className="col-span-2 row-start-2 grid grid-cols-3 gap-1 sm:grid-cols-6 md:flex md:flex-col md:gap-1.5"
      >
        <p className="mb-2 hidden px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase md:block">
          Workspace
        </p>
        {pages.map(({ href, label, icon: Icon }) => (
          <Button
            key={href}
            asChild
            variant={pathname === href ? "secondary" : "ghost"}
            className="h-auto min-w-0 flex-col gap-1 px-1 py-2 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-3"
          >
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon aria-hidden="true" className="size-4 md:size-5" />
              <span className="max-w-full truncate" title={label}>
                {label}
              </span>
            </Link>
          </Button>
        ))}
      </nav>
      {settingsFailure && (
        <p role="alert" className="col-span-2 text-xs text-destructive">
          Saved navigation unavailable. Showing the default order.{" "}
          {settingsFailure}
        </p>
      )}
      <div className="col-start-2 row-start-1 min-w-0 md:mt-auto md:space-y-4">
        <p className="hidden items-center gap-2 px-2 text-xs text-muted-foreground md:flex">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          Your personal workspace
        </p>
        {accountMenu}
      </div>
    </aside>
  );
}
