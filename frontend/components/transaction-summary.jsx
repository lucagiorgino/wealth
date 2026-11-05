"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronDown, Scale } from "lucide-react";
import {
  Bar,
  BarChart,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ExactTooltipValue } from "@/components/expense-charts";
import { MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

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
    key: "net",
    label: "Net income",
    Icon: Scale,
    tone: "bg-accent text-accent-foreground",
  },
];

function ExactTooltip({ currency }) {
  return (
    <ChartTooltip
      cursor={false}
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => payload[0]?.payload.label}
          formatter={(_, __, point) => (
            <ExactTooltipValue
              color={point.payload.fill}
              amount={point.payload.amount}
              currency={currency}
            />
          )}
        />
      }
    />
  );
}

function CategoryDonut({ points, amount, currency, label }) {
  const negative = points.some((point) => point.amount.startsWith("-"));
  const available = !negative && points.some((point) => point.value > 0);
  const data = available
    ? points.map((point, index) => ({
        ...point,
        fill: `var(--chart-${(index % 5) + 1})`,
      }))
    : [{ value: 1, fill: "var(--muted)" }];
  return (
    <>
      <div className="relative">
        <ChartContainer
          config={{ value: { label } }}
          className="mx-auto aspect-square h-56 w-full max-w-[260px]"
        >
          <PieChart
            accessibilityLayer
            aria-label={`${currency ?? ""} ${label} by category`}
          >
            {available && <ExactTooltip currency={currency} />}
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="92%"
              strokeWidth={3}
              isAnimationActive={false}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-[52%] space-y-1 text-center">
            <p
              data-slot="summary-total"
              className="text-xl font-semibold tabular-nums [overflow-wrap:anywhere]"
            >
              {currency ? (
                <MoneyAmount amount={amount} currency={currency} />
              ) : (
                "0"
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Total {label.toLowerCase()}
            </p>
          </div>
        </div>
      </div>
      {!available && (
        <p className="text-xs text-muted-foreground">
          {negative
            ? "Negative category totals cannot be shown as donut shares."
            : "No nonzero category totals."}
        </p>
      )}
      {points.length > 0 && (
        <Collapsible defaultOpen={negative}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full">
              View {label.toLowerCase()} categories
              <ChevronDown aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="space-y-2 pt-2">
              {points.map((point, index) => (
                <div
                  key={point.key}
                  className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"
                >
                  <dt className="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: `var(--chart-${(index % 5) + 1})`,
                      }}
                    />
                    {point.label}
                  </dt>
                  <dd className="tabular-nums [overflow-wrap:anywhere]">
                    <MoneyAmount amount={point.amount} currency={currency} />
                  </dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

function NetBar({ points, currency }) {
  const point = points.find((point) => point.key === "net");
  const negative = point.amount.startsWith("-");
  const color = negative
    ? "var(--expense-foreground)"
    : "var(--income-foreground)";
  const data = [{ ...point, fill: color }];
  return (
    <ChartContainer
      config={{ value: { label: "Net income", color } }}
      className="h-56 w-full"
    >
      <BarChart
        accessibilityLayer
        data={data}
        aria-label={`${currency} net income`}
        margin={{ top: 28, bottom: 28, left: 12, right: 12 }}
      >
        <XAxis dataKey="label" hide />
        <YAxis hide domain={negative ? [-10000, 0] : [0, 10000]} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" />
        <ExactTooltip currency={currency} />
        <Bar
          dataKey="value"
          fill={color}
          radius={6}
          maxBarSize={72}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="amount"
            position={negative ? "bottom" : "top"}
            offset={12}
            content={({ x, y, width, value }) => (
              <text
                x={x + width / 2}
                y={negative ? y + 18 : y - 10}
                textAnchor="middle"
                className="fill-foreground text-xs"
                textLength={value?.length > 24 ? "90%" : undefined}
                lengthAdjust="spacingAndGlyphs"
              >
                {value}
              </text>
            )}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

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
      <div className="grid gap-4 lg:grid-cols-3">
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
              summary.currencies.map((total, index) => (
                <div
                  key={total.currency}
                  role="group"
                  aria-label={`${total.currency} ${label.toLowerCase()}`}
                  className="space-y-1"
                >
                  {summary.currencies.length > 1 && (
                    <h4 className="text-xs font-medium text-muted-foreground">
                      {total.currency}
                    </h4>
                  )}
                  {key === "net" ? (
                    <>
                      <p
                        data-slot="summary-total"
                        className="text-xl font-semibold tabular-nums [overflow-wrap:anywhere]"
                      >
                        <MoneyAmount
                          amount={total.net}
                          currency={total.currency}
                        />
                      </p>
                      <NetBar
                        points={summary.charts[index].cashflow}
                        currency={total.currency}
                      />
                    </>
                  ) : (
                    <CategoryDonut
                      points={
                        summary.charts[index][
                          key === "expense" ? "expenses" : "income"
                        ]
                      }
                      amount={total[key]}
                      currency={total.currency}
                      label={label}
                    />
                  )}
                </div>
              ))
            ) : key === "net" ? (
              <p className="text-xl font-semibold tabular-nums">0</p>
            ) : (
              <CategoryDonut points={[]} amount="0" label={label} />
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
