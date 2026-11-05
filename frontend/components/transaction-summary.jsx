"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Scale,
} from "lucide-react";
import { MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const metrics = [
  {
    key: "expense",
    label: "Expenses",
    Icon: ArrowUpRight,
    tone: "bg-expense text-expense-foreground",
  },
  {
    key: "income",
    label: "Income",
    Icon: ArrowDownLeft,
    tone: "bg-income text-income-foreground",
  },
  {
    key: "transfer",
    label: "Transfers",
    Icon: ArrowLeftRight,
    tone: "bg-transfer text-transfer-foreground",
  },
  {
    key: "net",
    label: "Net income",
    Icon: Scale,
    tone: "bg-accent text-accent-foreground",
  },
];

export function TransactionSummary({ summary }) {
  return (
    <section
      aria-labelledby="transaction-summary-heading"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="transaction-summary-heading" className="text-lg font-semibold">
          Summary
        </h2>
        <p className="text-xs text-muted-foreground">
          All matching transactions, across every page.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(({ key, label, Icon, tone }) => (
          <section
            key={key}
            aria-label={label}
            className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}
              >
                <Icon aria-hidden="true" className="size-4" />
              </span>
              {label}
            </h3>
            {summary.currencies.length ? (
              summary.currencies.map((total) => (
                <div key={total.currency} className="space-y-1">
                  <p className="text-lg font-semibold tabular-nums [overflow-wrap:anywhere]">
                    <MoneyAmount
                      amount={total[key]}
                      currency={total.currency}
                    />
                  </p>
                  {summary.currencies.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {total.currency}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-lg font-semibold tabular-nums">0</p>
            )}
            {key === "net" && (
              <p className="text-xs text-muted-foreground">
                Income minus expenses. Transfers excluded.
              </p>
            )}
          </section>
        ))}
      </div>
      {summary.currencies.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Currencies are shown separately; no conversion or mixed-currency
          total.
        </p>
      )}
      <Collapsible className="rounded-lg border bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-between gap-2 px-4 py-3 text-left whitespace-normal [&[data-state=open]>svg]:rotate-180"
          >
            Expenses by wallet
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform motion-reduce:transition-none"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            role="region"
            aria-label="Wallet expense totals"
            className="border-t p-4"
          >
            {summary.wallet_expenses.length ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                {summary.wallet_expenses.map((wallet) => (
                  <div
                    key={wallet.wallet_id}
                    className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                  >
                    <dt className="text-sm [overflow-wrap:anywhere]">
                      {wallet.wallet_name}
                    </dt>
                    <dd className="text-sm font-medium tabular-nums [overflow-wrap:anywhere]">
                      <MoneyAmount
                        amount={wallet.amount}
                        currency={wallet.currency}
                      />
                      {summary.currencies.length > 1 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {wallet.currency}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No expenses match these filters.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
