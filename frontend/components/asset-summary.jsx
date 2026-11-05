"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Landmark } from "lucide-react";
import { AssetCharts } from "@/components/asset-charts";
import { AssetDialog, DeleteAssetButton } from "@/components/asset-form";
import { MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
const frozen =
  "sticky left-0 z-10 w-44 min-w-44 max-w-44 whitespace-normal bg-card [overflow-wrap:anywhere] sm:w-56 sm:min-w-56 sm:max-w-56";

function Amount({ value, currency, percent = false }) {
  if (value === null) return <span aria-label="Not available">&mdash;</span>;
  if (percent) {
    const label = /[1-9]/.test(value.split(/[eE]/)[0])
      ? value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
      : "0";
    return <span title={`${value}%`}>{label}%</span>;
  }
  return <MoneyAmount amount={value} currency={currency} />;
}

function ValueCells({ values, currency, percent }) {
  return values.months.map((value, index) => (
    <TableCell key={index} className="min-w-28 px-3 text-right tabular-nums">
      <Amount value={value} currency={currency} percent={percent} />
    </TableCell>
  ));
}

function CurrencyAssets({ item, today }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const showDetails = collapsed.size < item.groups.length;
  const missing = item.missing_values.some((count) => count > 0);
  function toggle(key) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <section
      aria-label={`${item.currency} assets`}
      className="min-w-0 space-y-4"
    >
      <h2 className="text-lg font-semibold">
        Patrimony{" "}
        <span className="text-muted-foreground">/ {item.currency}</span>
      </h2>
      {missing && (
        <p className="text-sm text-muted-foreground">
          Some holdings have no recorded valuation in this period. Totals
          include recorded values only; changes are unavailable until both
          months are complete.
        </p>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        {[
          ["Net worth", item.net_worth.latest],
          ["Assets", item.assets.latest],
          ["Liabilities", item.liabilities.latest],
        ].map(([label, amount]) => (
          <Card key={label} size="sm" className="min-w-0">
            <CardHeader>
              <CardTitle>
                <h3>{label}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums [overflow-wrap:anywhere]">
              <Amount value={amount} currency={item.currency} />
            </CardContent>
          </Card>
        ))}
      </div>
      {item.net_worth.latest !== null && <AssetCharts item={item} />}
      <Card className="min-w-0">
        <CardHeader className="items-center">
          <CardTitle>
            <h3>Monthly balances</h3>
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            className="w-fit"
            aria-pressed={showDetails}
            onClick={() =>
              setCollapsed(
                showDetails
                  ? new Set(item.groups.map((group) => group.key))
                  : new Set(),
              )
            }
          >
            {showDetails ? "Hide holdings" : "Show holdings"}
          </Button>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3">
          <div
            role="region"
            aria-label={`${item.currency} monthly assets, scroll horizontally`}
            tabIndex={0}
            className="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [&>[data-slot=table-container]]:overflow-visible"
          >
            <Table aria-label={`${item.currency} monthly assets`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className={frozen}>
                    Asset / liability
                  </TableHead>
                  {months.map((month) => (
                    <TableHead
                      key={month}
                      scope="col"
                      className="min-w-28 px-3 text-right"
                    >
                      {month}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.groups.map((group) => (
                  <Fragment key={group.key}>
                    <TableRow className="bg-muted/30 font-medium">
                      <TableHead scope="row" className={frozen}>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full justify-start whitespace-normal text-left"
                          aria-expanded={!collapsed.has(group.key)}
                          onClick={() => toggle(group.key)}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={
                              collapsed.has(group.key) ? "-rotate-90" : ""
                            }
                          />
                          {group.label}
                        </Button>
                      </TableHead>
                      <ValueCells
                        values={group.values}
                        currency={item.currency}
                      />
                    </TableRow>
                    {!collapsed.has(group.key) &&
                      group.holdings.map((holding) => (
                        <TableRow key={`${holding.source}-${holding.id}`}>
                          <TableHead scope="row" className={`${frozen} pl-6`}>
                            <span className="block">{holding.name}</span>
                            {!holding.active ? (
                              <span className="text-xs text-muted-foreground">
                                Closed holding: frozen history
                              </span>
                            ) : holding.source === "wallet" ? (
                              <Link
                                href="/wallets"
                                className="inline-flex min-h-11 items-center text-xs text-primary-ink underline underline-offset-4"
                              >
                                Wallet balance
                              </Link>
                            ) : (
                              <span className="flex">
                                <AssetDialog asset={holding} today={today} />
                                <DeleteAssetButton asset={holding} />
                              </span>
                            )}
                          </TableHead>
                          <ValueCells
                            values={holding.values}
                            currency={item.currency}
                          />
                        </TableRow>
                      ))}
                  </Fragment>
                ))}
              </TableBody>
              <TableFooter>
                {[
                  ["Assets", item.assets],
                  ["Liabilities", item.liabilities],
                  ["Net worth", item.net_worth],
                  ["Monthly change", item.change],
                  ["Monthly change (%)", item.change_percent, true],
                ].map(([label, values, percent]) => (
                  <TableRow key={label}>
                    <TableHead scope="row" className={frozen}>
                      {label}
                    </TableHead>
                    <ValueCells
                      values={values}
                      currency={item.currency}
                      percent={percent}
                    />
                  </TableRow>
                ))}
              </TableFooter>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            Completed months use month-end values; the current month stops
            today. Dashes mean no valuation or a future month, not zero.
            Allocation excludes liabilities. Snapshot balances are never summed
            across months.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

export function AssetSummary({ summary }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  useEffect(() => {
    if (summary.year !== Number(summary.as_of.slice(0, 4))) return;
    function refresh() {
      if (
        document.visibilityState === "visible" &&
        !refreshing &&
        !document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      )
        startTransition(() => router.refresh());
    }
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [summary.year, summary.as_of, router, refreshing]);
  if (!summary.currencies.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Landmark aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No assets yet</EmptyTitle>
          <EmptyDescription>
            Add a wallet for cash balances, or add an asset or liability and
            record its first valuation. No sample financial data is added.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline">
          <Link href="/wallets">Manage wallets</Link>
        </Button>
      </Empty>
    );
  return summary.currencies.map((item) => (
    <CurrencyAssets
      key={`${summary.year}-${item.currency}`}
      item={item}
      today={summary.as_of}
    />
  ));
}
