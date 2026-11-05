"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionForm } from "@/components/transaction-manager";
import { TransactionImport } from "@/components/transaction-import";
import { PageHeading } from "@/components/page-heading";
import { Feedback } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  shiftTransactionMonth,
  transactionMonthLabel,
  transactionPeriodQuery,
  transactionViewQuery,
  transactionYearMonth,
  transactionTypeLabel,
  TransactionInputError,
} from "@/lib/transactions";

function TransactionYear({ filters, center }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const previous = shiftTransactionMonth(center, -12);
  const next = shiftTransactionMonth(center, 12);
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        asChild={Boolean(previous)}
        disabled={!previous}
        variant="ghost"
        size="icon"
        aria-label="Previous year"
      >
        {previous ? (
          <Link
            href={`/transactions?${transactionPeriodQuery(filters, previous)}`}
            scroll={false}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
        ) : (
          <ChevronLeft aria-hidden="true" />
        )}
      </Button>
      <span className="text-sm text-muted-foreground">Year</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={`Choose transaction year, ${center.slice(0, 4)}`}
            className="min-w-20 tabular-nums"
          >
            {center.slice(0, 4)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <form
            aria-label="Choose transaction year"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              let target;
              try {
                target = transactionYearMonth(
                  center,
                  new FormData(event.currentTarget).get("year"),
                );
              } catch (error) {
                if (!(error instanceof TransactionInputError)) throw error;
                setError(error.message);
                return;
              }
              router.push(
                `/transactions?${transactionPeriodQuery(filters, target)}`,
                { scroll: false },
              );
              setError("");
              setOpen(false);
            }}
          >
            <Label htmlFor="transaction-year">Year</Label>
            <Input
              id="transaction-year"
              name="year"
              type="number"
              min={1}
              max={9999}
              step={1}
              required
              defaultValue={center.slice(0, 4)}
            />
            <Feedback state={{ error }} />
            <Button type="submit" className="w-full">
              Go to year
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        asChild={Boolean(next)}
        disabled={!next}
        variant="ghost"
        size="icon"
        aria-label="Next year"
      >
        {next ? (
          <Link
            href={`/transactions?${transactionPeriodQuery(filters, next)}`}
            scroll={false}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <ChevronRight aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

export function TransactionToolbar({
  filters,
  month,
  today,
  wallets,
  categories,
  activeFilters,
}) {
  const searchFields = new URLSearchParams(
    transactionViewQuery(filters, month, 1),
  );
  searchFields.delete("q");
  return (
    <div className="space-y-4">
      <PageHeading
        eyebrow="Activity"
        title="Transactions"
        description="Every income, expense, and transfer, with the details that matter."
        actions={
          <div
            role="group"
            aria-label="Transaction tools"
            className="flex flex-wrap gap-2"
          >
            <NewTransactionDialog
              wallets={wallets}
              categories={categories}
              today={today}
              month={month}
            />
            <TransactionImport wallets={wallets} categories={categories} />
            <div
              key={transactionViewQuery(filters, month)}
              className="flex gap-2"
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Search transactions"
                  >
                    <Search aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  aria-label="Search transactions"
                  className="w-[min(22rem,calc(100vw-2rem))] p-4"
                >
                  <form
                    action="/transactions"
                    method="get"
                    aria-label="Search transactions"
                    className="space-y-3"
                  >
                    {[...searchFields].map(([key, value]) => (
                      <input key={key} type="hidden" name={key} value={value} />
                    ))}
                    <Label htmlFor="transaction-search">
                      Search descriptions
                    </Label>
                    <Input
                      id="transaction-search"
                      name="q"
                      maxLength={500}
                      defaultValue={filters.q ?? ""}
                      placeholder="Find a transaction..."
                    />
                    <Button type="submit" className="w-full">
                      Search
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Filter transactions"
                    aria-description={`${activeFilters} active filters`}
                    className="relative"
                  >
                    <Filter aria-hidden="true" />
                    {activeFilters > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                      >
                        {activeFilters}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle>Filter transactions</SheetTitle>
                    <SheetDescription>
                      Choose a period and narrow your transaction history.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="px-4 pb-6">
                    <TransactionFilters
                      filters={filters}
                      month={month}
                      today={today}
                      wallets={wallets}
                      categories={categories}
                    />
                  </div>
                </SheetContent>
              </Sheet>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Transaction options"
                  >
                    <MoreVertical aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/transactions?${transactionPeriodQuery(filters, today.slice(0, 7))}`}
                    >
                      Current month
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/transactions?${transactionPeriodQuery(filters, "all")}`}
                    >
                      All dates
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/transactions">Reset all filters</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal whitespace-normal text-muted-foreground">
                    Recurring occurrences are calculated through {today} (UTC).
                    Future start dates appear once; future repeats appear when
                    due. Wallet balances include only entries due through today
                    UTC.
                  </DropdownMenuLabel>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />
      {activeFilters > 0 && (
        <div
          aria-label="Active transaction filters"
          className="flex flex-wrap items-center gap-2"
        >
          {[
            filters.q && `Search: ${filters.q}`,
            filters.type && `Type: ${transactionTypeLabel(filters.type)}`,
            filters.wallet_id &&
              `Wallet: ${wallets.find((item) => item.id === filters.wallet_id)?.name ?? "selected wallet"}`,
            filters.category_id &&
              `Category: ${categories.find((item) => item.id === filters.category_id)?.name ?? "selected category"}`,
            filters.subcategory_id &&
              `Subcategory: ${categories.flatMap((item) => item.subcategories).find((item) => item.id === filters.subcategory_id)?.name ?? "selected subcategory"}`,
            month === "all" &&
              filters.date_from &&
              `From: ${filters.date_from}`,
            month === "all" && filters.date_to && `Through: ${filters.date_to}`,
          ]
            .filter(Boolean)
            .map((label) => (
              <Badge
                key={label}
                variant="secondary"
                className="max-w-full px-3 py-1.5 font-normal whitespace-normal [overflow-wrap:anywhere]"
              >
                {label}
              </Badge>
            ))}
          <Button asChild variant="link">
            <Link
              href={`/transactions?${transactionViewQuery({ page: 1 }, month)}`}
            >
              Clear filters
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export function TransactionMonths({ filters, month, today }) {
  const selectedRef = useRef(null);
  const center =
    month === "all"
      ? (filters.date_from ?? filters.date_to ?? today).slice(0, 7)
      : month;
  const months = Array.from(
    { length: 12 },
    (_, index) => `${center.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`,
  );
  const previous = shiftTransactionMonth(center, -1);
  const next = shiftTransactionMonth(center, 1);
  useEffect(() => {
    const selected = selectedRef.current;
    const viewport = selected?.closest('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    function centerSelected() {
      const item = selected.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      viewport.scrollLeft +=
        item.left - bounds.left - (viewport.clientWidth - item.width) / 2;
    }
    centerSelected();
    const observer = new ResizeObserver(centerSelected);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [center, month]);
  return (
    <div className="space-y-2">
      <TransactionYear
        key={center.slice(0, 4)}
        filters={filters}
        center={center}
      />
      <nav
        aria-label="Transaction months"
        className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2"
      >
        <Button
          asChild={Boolean(previous)}
          disabled={!previous}
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Previous month"
        >
          {previous ? (
            <Link
              href={`/transactions?${transactionPeriodQuery(filters, previous)}`}
              scroll={false}
            >
              <ChevronLeft aria-hidden="true" />
            </Link>
          ) : (
            <ChevronLeft aria-hidden="true" />
          )}
        </Button>
        <ScrollArea className="w-0 min-w-0 flex-1">
          <div className="mx-auto flex w-max py-2">
            {months.map((value) => (
              <Button
                key={value}
                asChild
                variant={value === month ? "secondary" : "ghost"}
                className="h-12 min-w-16 px-3"
              >
                <Link
                  href={`/transactions?${transactionPeriodQuery(filters, value)}`}
                  ref={value === center ? selectedRef : undefined}
                  scroll={false}
                  aria-label={transactionMonthLabel(value)}
                  aria-current={value === month ? "page" : undefined}
                  className="flex flex-col gap-0.5"
                >
                  <span
                    className={
                      value === today.slice(0, 7) ? "font-semibold" : ""
                    }
                  >
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${value}-01T00:00:00Z`))}
                  </span>
                </Link>
              </Button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Button
          asChild={Boolean(next)}
          disabled={!next}
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Next month"
        >
          {next ? (
            <Link
              href={`/transactions?${transactionPeriodQuery(filters, next)}`}
              scroll={false}
            >
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </Button>
      </nav>
    </div>
  );
}

export function NewTransactionDialog({ wallets, categories, today, month }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      {saved && (
        <p
          role="status"
          className="order-last basis-full text-sm text-primary-ink"
        >
          Transaction saved.
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) setSaved(false);
        }}
      >
        <DialogTrigger asChild>
          <Button aria-label="Add transaction" className="gap-2 px-4">
            <Plus aria-hidden="true" />
            <span>
              Add<span className="hidden sm:inline"> transaction</span>
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a transaction</DialogTitle>
            <DialogDescription>
              Record income, an expense, a transfer, or a Balance Adjustment.
              Adjustments reconcile the following month without affecting P&L.
            </DialogDescription>
          </DialogHeader>
          {wallets.length ? (
            <TransactionForm
              wallets={wallets}
              categories={categories}
              today={today}
              defaultDate={
                month === "all" || month === today.slice(0, 7)
                  ? today
                  : `${month}-01`
              }
              onSaved={(date) => {
                setOpen(false);
                setSaved(true);
                router.push(
                  `/transactions?${transactionPeriodQuery({ page: 1 }, month === "all" ? "all" : date.slice(0, 7))}`,
                  { scroll: false },
                );
              }}
            />
          ) : (
            <div className="space-y-3">
              <p>
                Create at least one{" "}
                <Link className="underline" href="/wallets">
                  wallet
                </Link>{" "}
                and one{" "}
                <Link className="underline" href="/categories">
                  category
                </Link>{" "}
                before adding a transaction.
              </p>
              <p>
                Recording income?{" "}
                <Link
                  className="underline"
                  href="/categories?kind=income#income-categories"
                >
                  Set up income categories or browse income presets
                </Link>
                .
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
