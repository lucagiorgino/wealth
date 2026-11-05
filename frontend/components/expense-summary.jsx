"use client";

import { Fragment, useId, useState } from "react";
import Link from "next/link";
import {
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const frozenColumn =
  "sticky left-0 z-10 w-44 min-w-44 max-w-44 whitespace-normal bg-card [overflow-wrap:anywhere] sm:w-56 sm:min-w-56 sm:max-w-56";

export function SummaryYear({ year }) {
  return (
    <nav
      aria-label="Summary years"
      className="flex items-center justify-center gap-2"
    >
      <Button
        asChild={year > 1}
        disabled={year === 1}
        variant="ghost"
        size="icon"
        aria-label="Previous year"
      >
        {year > 1 ? (
          <Link href={`/summary?year=${year - 1}`} scroll={false}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        ) : (
          <ChevronLeft aria-hidden="true" />
        )}
      </Button>
      <span className="text-sm text-muted-foreground">Year</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={`Choose summary year, ${year}`}
            className="min-w-20 tabular-nums"
          >
            {year}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <form
            action="/summary"
            method="get"
            aria-label="Choose summary year"
            className="space-y-3"
          >
            <Label htmlFor="summary-year">Year</Label>
            <Input
              id="summary-year"
              name="year"
              type="number"
              min={1}
              max={9999}
              step={1}
              required
              defaultValue={year}
            />
            <Button type="submit" className="w-full">
              Go to year
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        asChild={year < 9999}
        disabled={year === 9999}
        variant="ghost"
        size="icon"
        aria-label="Next year"
      >
        {year < 9999 ? (
          <Link href={`/summary?year=${year + 1}`} scroll={false}>
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <ChevronRight aria-hidden="true" />
        )}
      </Button>
    </nav>
  );
}

function AmountCells({ totals, currency }) {
  return [...totals.months, totals.total].map((amount, index) => (
    <TableCell
      key={index}
      className={`min-w-28 px-3 text-right tabular-nums ${index === 12 ? "bg-accent/60 font-semibold" : ""}`}
    >
      <MoneyAmount amount={amount} currency={currency} />
    </TableCell>
  ));
}

export function ExpenseSummaryTables({ summary, kind = "expense" }) {
  const income = kind === "income";
  const noun = income ? "income" : "expenses";
  const title = income ? "Income" : "Expenses";
  const totalsId = useId();
  const categoryKeys = summary.currencies.flatMap((item) =>
    item.categories.map((category) => `${item.currency}-${category.id}`),
  );
  const [expanded, setExpanded] = useState(() => new Set(categoryKeys));
  const [showTotals, setShowTotals] = useState(true);
  const allExpanded = categoryKeys.every((key) => expanded.has(key));
  if (!summary.currencies.length) {
    return (
      <Empty className="border bg-card py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesColumn aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            No {noun} in {summary.year}
          </EmptyTitle>
          <EmptyDescription>
            Only {noun} due through {summary.as_of} are included.{" "}
            {income ? "Expenses" : "Income"}, transfers, and future entries are
            excluded.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline">
          <Link href="/transactions">View transactions</Link>
        </Button>
      </Empty>
    );
  }
  return (
    <section
      aria-label={income ? "Income analysis" : "Expense analysis"}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label htmlFor={totalsId} className="min-h-11 cursor-pointer gap-3">
          <Checkbox
            id={totalsId}
            checked={showTotals}
            onCheckedChange={(value) => setShowTotals(value === true)}
          />
          Show category totals
        </Label>
        <Button
          variant="outline"
          onClick={() =>
            setExpanded(allExpanded ? new Set() : new Set(categoryKeys))
          }
        >
          {allExpanded
            ? "Collapse all subcategories"
            : "Expand all subcategories"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Category totals include their subcategories. Total {noun} counts every
        {income ? " income" : " expense"} once. Scroll horizontally to see all
        months.
      </p>
      {summary.currencies.map((item) => (
        <section
          key={item.currency}
          aria-labelledby={`${kind}-${item.currency}`}
          className="min-w-0 space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={`${kind}-${item.currency}`}
              className="text-lg font-semibold"
            >
              {title} in {item.currency}
            </h2>
            <p className="text-lg font-semibold tabular-nums [overflow-wrap:anywhere]">
              <MoneyAmount amount={item.total} currency={item.currency} />
            </p>
          </div>
          <div
            role="region"
            aria-label={`${item.currency} ${kind} table, scroll horizontally`}
            tabIndex={0}
            className="max-h-[70dvh] overflow-auto rounded-lg border bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&>[data-slot=table-container]]:overflow-visible"
          >
            <Table
              aria-label={`${item.currency} ${noun} for ${summary.year}`}
              className="min-w-max"
            >
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead scope="col" className={`${frozenColumn} z-30`}>
                    Category / subcategory
                  </TableHead>
                  {months.map((month) => (
                    <TableHead
                      key={month}
                      scope="col"
                      aria-label={month}
                      className="px-3 text-right"
                    >
                      {month.slice(0, 3)}
                    </TableHead>
                  ))}
                  <TableHead scope="col" className="bg-accent px-3 text-right">
                    Year total
                  </TableHead>
                </TableRow>
              </TableHeader>
              {item.categories.map((category) => {
                const key = `${item.currency}-${category.id}`;
                const open = expanded.has(key);
                return (
                  <Fragment key={category.id}>
                    <TableBody>
                      <TableRow className="bg-accent/30">
                        <TableHead scope="row" className={frozenColumn}>
                          <Button
                            variant="ghost"
                            aria-expanded={open}
                            aria-controls={`details-${key}`}
                            aria-label={`${open ? "Collapse" : "Expand"} ${category.name} subcategories`}
                            className="h-auto w-full justify-start gap-2 px-2 py-2 text-left whitespace-normal"
                            onClick={() =>
                              setExpanded((previous) => {
                                const next = new Set(previous);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
                            />
                            {category.name}
                          </Button>
                        </TableHead>
                        {showTotals ? (
                          <AmountCells
                            totals={category}
                            currency={item.currency}
                          />
                        ) : (
                          <TableCell
                            colSpan={13}
                            className="text-xs text-muted-foreground"
                          >
                            Category totals hidden
                          </TableCell>
                        )}
                      </TableRow>
                    </TableBody>
                    <TableBody id={`details-${key}`} hidden={!open}>
                      {category.subcategories.map((child) => (
                        <TableRow key={child.id ?? "uncategorized"}>
                          <TableHead
                            scope="row"
                            className={`${frozenColumn} py-3 pl-10 font-normal text-muted-foreground`}
                          >
                            {child.name}
                          </TableHead>
                          <AmountCells
                            totals={child}
                            currency={item.currency}
                          />
                        </TableRow>
                      ))}
                    </TableBody>
                  </Fragment>
                );
              })}
              <TableFooter>
                <TableRow>
                  <TableHead
                    scope="row"
                    className={`${frozenColumn} bg-accent py-4 font-semibold`}
                  >
                    Total {noun}
                  </TableHead>
                  <AmountCells totals={item} currency={item.currency} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        {title} due through {summary.as_of}. {income ? "Expenses" : "Income"}{" "}
        and transfers are excluded. Currencies are never combined or converted.
      </p>
    </section>
  );
}
