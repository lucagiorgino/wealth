"use client";

import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const relativeTick = (value) => `${value / 100}%`;
export const shortLabel = (label) =>
  label.length > 18 ? `${label.slice(0, 17)}…` : label;
const config = { value: { label: "Expenses", color: "var(--chart-1)" } };
export const relativeScale = (negative) => ({
  domain: negative ? [-10000, 10000] : [0, 10000],
  tickFormatter: relativeTick,
  ticks: negative ? [-10000, -5000, 0, 5000, 10000] : [0, 5000, 10000],
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)" },
});

function ExactChartData({ points, currency, title, sum, average }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="mt-2">
          View {title.toLowerCase()} data
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role="region"
          aria-label={`${currency} ${title.toLowerCase()} data, scroll horizontally`}
          tabIndex={0}
          className="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [&>[data-slot=table-container]]:overflow-visible"
        >
          <Table aria-label={`${currency} ${title.toLowerCase()} data`}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Category / month</TableHead>
                <TableHead scope="col" className="text-right">
                  Expenses
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((point) => (
                <TableRow key={point.key}>
                  <TableHead scope="row" className="whitespace-normal">
                    {point.label}
                  </TableHead>
                  <TableCell className="text-right tabular-nums">
                    <MoneyAmount amount={point.amount} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {[
                ["Sum", sum],
                ["Average", average],
              ].map(([label, amount]) => (
                <TableRow key={label}>
                  <TableHead scope="row">{label}</TableHead>
                  <TableCell className="text-right tabular-nums">
                    <MoneyAmount amount={amount} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableFooter>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AnnualChart({ item }) {
  const { ranking: points, currency } = item;
  const [view, setView] = useState("bar");
  const viewId = useId();
  const negative = points.some(
    (point) => point.value < 0 || point.amount.startsWith("-"),
  );
  const scale = relativeScale(negative);
  const title = "Category ranking";
  const donutAvailable = !negative && points.some((point) => point.value > 0);
  const donut = view === "donut" && donutAvailable;
  const slices = points.map((point, index) => ({
    ...point,
    fill: `var(--chart-${(index % 5) + 1})`,
  }));
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => payload[0]?.payload.label}
          formatter={(_, __, item) => (
            <MoneyAmount amount={item.payload.amount} currency={currency} />
          )}
        />
      }
    />
  );
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>
          Your 10 highest-spend categories. Sum and average cover these
          displayed categories, not every category or a monthly average.
        </CardDescription>
        <div className="mt-2 max-w-sm space-y-2">
          <Label htmlFor={viewId}>Category chart view</Label>
          <NativeSelect
            id={viewId}
            value={donut ? "donut" : "bar"}
            onChange={(event) => setView(event.target.value)}
          >
            <NativeSelectOption value="bar">Bar chart</NativeSelectOption>
            <NativeSelectOption value="donut" disabled={!donutAvailable}>
              Donut chart
            </NativeSelectOption>
          </NativeSelect>
        </div>
        {!donutAvailable && (
          <p className="text-sm text-muted-foreground">
            Donut view requires nonnegative category totals and at least one
            visible positive amount. Signed refunds remain in the bar chart.
          </p>
        )}
      </CardHeader>
      <CardContent className="min-w-0">
        <ChartContainer
          config={config}
          role="img"
          aria-label={`${currency} ${title.toLowerCase()}, ${donut ? "donut share of displayed categories" : "relative expense scale"}`}
          className="aspect-auto w-full"
          style={{ height: Math.max(240, points.length * 26) }}
        >
          {donut ? (
            <PieChart accessibilityLayer>
              {tooltip}
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="50%"
                outerRadius="80%"
                isAnimationActive={false}
              >
                {slices.map((point) => (
                  <Cell key={point.key} fill={point.fill} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart
              accessibilityLayer
              data={points}
              layout="vertical"
              margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis {...scale} type="number" />
              {negative && (
                <ReferenceLine
                  x={0}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                />
              )}
              <YAxis
                type="category"
                tick={{ fill: "var(--muted-foreground)" }}
                dataKey="label"
                width={112}
                tickFormatter={shortLabel}
                tickLine={false}
                axisLine={false}
              />
              {tooltip}
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={4}
                maxBarSize={24}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ChartContainer>
        <p className="mt-3 text-xs text-muted-foreground">
          {donut ? (
            "Slices show the relative shares of the displayed categories. Very small amounts may not be visible. "
          ) : (
            <>
              Relative scale: this chart’s largest{" "}
              {negative ? "absolute magnitude" : "amount"} = 100%. Very small
              amounts may not be visible.{" "}
            </>
          )}
          Exact values are below and in tooltips.
        </p>
        {donut && (
          <ul
            aria-label={`${currency} donut categories`}
            className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"
          >
            {slices.map((point) => (
              <li
                key={point.key}
                className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [overflow-wrap:anywhere]"
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-sm"
                  style={{ backgroundColor: point.fill }}
                />
                {point.label}:{" "}
                <MoneyAmount amount={point.amount} currency={currency} />
              </li>
            ))}
          </ul>
        )}
        <ExactChartData
          points={points}
          currency={currency}
          title={title}
          sum={item.ranking_sum}
          average={item.ranking_average}
        />
      </CardContent>
    </Card>
  );
}

const monthlyConfig = {
  expenses: { label: "Expenses", color: "var(--expense-foreground)" },
  income: { label: "Income", color: "var(--income-foreground)" },
  net: { label: "Net income", color: "var(--income-foreground)" },
};

function MonthlyChart({ item, net = false }) {
  const title = net ? "Monthly net income" : "Monthly income and expenses";
  const rows = item.trend.map((point, index) => ({
    key: point.key,
    label: point.label,
    expenses: point.value,
    expensesAmount: point.amount,
    income: item.income_trend[index].value,
    incomeAmount: item.income_trend[index].amount,
    net: item.net_trend[index].value,
    netAmount: item.net_trend[index].amount,
  }));
  const negative =
    net || rows.some((row) => row.expensesAmount.startsWith("-"));
  const series = net ? ["net"] : ["expenses", "income"];
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>
          {net
            ? "Income minus expenses. Positive is a surplus; negative is a deficit."
            : "Monthly expense and income totals side by side, not a forecast."}{" "}
          Transfers are excluded.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <ChartContainer
          config={monthlyConfig}
          role="img"
          aria-label={`${item.currency} ${title.toLowerCase()}, relative cash flow scale`}
          className="h-60 w-full aspect-auto"
        >
          <BarChart
            accessibilityLayer
            data={rows}
            margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis {...relativeScale(negative)} width={44} />
            <ReferenceLine y={0} stroke="var(--foreground)" strokeWidth={1.5} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload[0]?.payload.label}
                  formatter={(_, name, point) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{monthlyConfig[name].label}</span>
                      <MoneyAmount
                        amount={point.payload[`${name}Amount`]}
                        currency={item.currency}
                      />
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                fill={`var(--color-${key})`}
                radius={4}
                maxBarSize={24}
                isAnimationActive={false}
              >
                {net &&
                  rows.map((row) => (
                    <Cell
                      key={row.key}
                      fill={
                        row.netAmount.startsWith("-")
                          ? "var(--expense-foreground)"
                          : "var(--income-foreground)"
                      }
                    />
                  ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
        <p className="mt-3 text-xs text-muted-foreground">
          Relative scale: this chart’s largest absolute magnitude = 100%. Very
          small amounts may not be visible. Exact values are below and in
          tooltips.
        </p>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="mt-2">
              View {title.toLowerCase()} data
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              role="region"
              aria-label={`${item.currency} ${title.toLowerCase()} data, scroll horizontally`}
              tabIndex={0}
              className="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [&>[data-slot=table-container]]:overflow-visible"
            >
              <Table
                aria-label={`${item.currency} ${title.toLowerCase()} data`}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Month</TableHead>
                    {["Expenses", "Income", "Net income"].map((label) => (
                      <TableHead key={label} scope="col" className="text-right">
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableHead scope="row">{row.label}</TableHead>
                      {["expenses", "income", "net"].map((key) => (
                        <TableCell
                          key={key}
                          className="text-right tabular-nums"
                        >
                          <MoneyAmount
                            amount={row[`${key}Amount`]}
                            currency={item.currency}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableHead scope="row">Totals</TableHead>
                    {["expenses", "income", "net"].map((key) => (
                      <TableCell key={key} className="text-right tabular-nums">
                        <MoneyAmount
                          amount={item.totals[key]}
                          currency={item.currency}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function ExpenseCharts({ charts }) {
  const [view, setView] = useState("cashflow");
  const viewId = useId();
  if (!charts.length) return null;
  return (
    <section aria-label="Spending charts" className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Spending at a glance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare income, expenses, and monthly net income over the year. Each
          currency stays separate.
        </p>
      </div>
      <div className="max-w-sm space-y-2">
        <Label htmlFor={viewId}>Monthly chart view</Label>
        <NativeSelect
          id={viewId}
          value={view}
          onChange={(event) => setView(event.target.value)}
        >
          <NativeSelectOption value="cashflow">
            Monthly Income and Expenses
          </NativeSelectOption>
          <NativeSelectOption value="net">
            Monthly Net Income
          </NativeSelectOption>
        </NativeSelect>
      </div>
      {charts.map((item) => (
        <section
          key={item.currency}
          aria-label={`${item.currency} spending charts`}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold text-muted-foreground">
            {item.currency}
          </h3>
          <div className="grid items-start gap-3 xl:grid-cols-2">
            <MonthlyChart key={view} item={item} net={view === "net"} />
            {item.ranking.length > 0 && <AnnualChart item={item} />}
          </div>
        </section>
      ))}
    </section>
  );
}
