"use client";

import { useId, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, X } from "lucide-react";
import { compareExpensesAction } from "@/app/(app)/summary/actions";
import { relativeScale, shortLabel } from "@/components/expense-charts";
import { Feedback } from "@/components/feedback";
import { MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  comparisonPayload,
  defaultComparison,
  SummaryInputError,
} from "@/lib/summary";

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
const modes = { month: "Months", year: "Years", average: "Yearly averages" };

function ComparisonResult({ comparison }) {
  if (!comparison.currencies.length)
    return (
      <p
        role="status"
        className="rounded-lg border bg-card p-6 text-sm text-muted-foreground"
      >
        No expenses in the selected periods. Income, transfers, and future
        entries are excluded.
      </p>
    );
  const config = Object.fromEntries(
    comparison.periods.map((period, index) => [
      period.key,
      {
        label: `${index + 1}. ${period.label}`,
        color: `var(--chart-${index + 1})`,
      },
    ]),
  );
  return (
    <div aria-label="Comparison results" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Results reflect the last successful comparison, through{" "}
        {comparison.as_of} UTC.{" "}
        {comparison.kind === "average" &&
          "Yearly averages are rounded to 18 decimal places; independently rounded categories may not sum to the rounded total."}
      </p>
      {comparison.currencies.map((item) => {
        const negative = item.categories.some((category) =>
          category.points.some(
            (point) => point.value < 0 || point.amount.startsWith("-"),
          ),
        );
        const data = item.categories.slice(0, 8).map((category) => ({
          label: category.name,
          ...Object.fromEntries(
            category.points.map((point) => [point.key, point.value]),
          ),
          amounts: Object.fromEntries(
            category.points.map((point) => [point.key, point.amount]),
          ),
        }));
        return (
          <Card key={item.currency} className="min-w-0">
            <CardHeader>
              <CardTitle>
                <h3>
                  {modes[comparison.kind]} comparison · {item.currency}
                </h3>
              </CardTitle>
              <CardDescription>
                Up to 8 categories ranked by their highest selected-period
                amount. All categories appear in the table.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <ol
                aria-label={`${item.currency} comparison legend`}
                className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
              >
                {comparison.periods.map((period, index) => (
                  <li key={period.key} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1 size-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: `var(--chart-${index + 1})` }}
                    />
                    <span>
                      {index + 1}. {period.label}
                      {comparison.kind === "average"
                        ? ` / ${period.years} ${period.years === 1 ? "year" : "years"}${period.end_year === Number(comparison.as_of.slice(0, 4)) ? ", current year partial" : ""}`
                        : comparison.kind === "year"
                          ? ` / ${period.months} months${period.year === Number(comparison.as_of.slice(0, 4)) ? ", current year partial" : ""}`
                          : period.year ===
                                Number(comparison.as_of.slice(0, 4)) &&
                              period.month ===
                                Number(comparison.as_of.slice(5, 7))
                            ? ", current month partial"
                            : ""}
                    </span>
                  </li>
                ))}
              </ol>
              <ChartContainer
                config={config}
                role="img"
                aria-label={`${item.currency} selected-period category comparison, relative expense scale`}
                className="aspect-auto w-full"
                style={{
                  height: Math.max(
                    280,
                    data.length * (comparison.periods.length * 14 + 20),
                  ),
                }}
              >
                <BarChart
                  accessibilityLayer
                  data={data}
                  layout="vertical"
                  margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis {...relativeScale(negative)} type="number" />
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
                    tickFormatter={shortLabel}
                    width={112}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) =>
                          payload[0]?.payload.label
                        }
                        formatter={(_, __, point) => (
                          <span className="flex w-full flex-wrap justify-between gap-3">
                            <span>{config[point.dataKey].label}</span>
                            <MoneyAmount
                              amount={point.payload.amounts[point.dataKey]}
                              currency={item.currency}
                            />
                          </span>
                        )}
                      />
                    }
                  />
                  {comparison.periods.map((period) => (
                    <Bar
                      key={period.key}
                      dataKey={period.key}
                      fill={`var(--color-${period.key})`}
                      radius={2}
                      maxBarSize={12}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
              <p className="text-xs text-muted-foreground">
                One shared relative scale across all selected periods: the
                largest{" "}
                {negative ? "absolute category magnitude" : "category amount"} =
                100%. Bars follow the numbered legend from top to bottom. Exact
                amounts are in the table; very small bars may not be visible.
              </p>
              <div
                role="region"
                aria-label={`${item.currency} comparison table, scroll horizontally`}
                tabIndex={0}
                className="overflow-x-auto rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring [&>[data-slot=table-container]]:overflow-visible"
              >
                <Table
                  aria-label={`${item.currency} ${comparison.kind} comparison`}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Category</TableHead>
                      {comparison.periods.map((period, index) => (
                        <TableHead
                          key={period.key}
                          scope="col"
                          className="min-w-40 text-right"
                        >
                          {index + 1}. {period.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableHead
                          scope="row"
                          className="min-w-32 whitespace-normal"
                        >
                          {category.name}
                        </TableHead>
                        {category.points.map((point) => (
                          <TableCell
                            key={point.key}
                            className="text-right tabular-nums"
                          >
                            <MoneyAmount
                              amount={point.amount}
                              currency={item.currency}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableHead scope="row">
                        Total expenses
                        {comparison.kind === "average" && " / year"}
                      </TableHead>
                      {item.totals.map((point) => (
                        <TableCell
                          key={point.key}
                          className="text-right tabular-nums"
                        >
                          <MoneyAmount
                            amount={point.amount}
                            currency={item.currency}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ExpenseComparison({ year, asOf }) {
  const id = useId();
  const [selection, setSelection] = useState(() =>
    defaultComparison(year, asOf),
  );
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function updatePeriod(index, key, value) {
    setSelection((current) => ({
      ...current,
      periods: current.periods.map((period, position) =>
        position === index ? { ...period, [key]: value } : period,
      ),
    }));
  }
  function submit(event) {
    event.preventDefault();
    let payload;
    try {
      payload = comparisonPayload(selection);
    } catch (error) {
      if (!(error instanceof SummaryInputError)) throw error;
      setError(error.message);
      return;
    }
    startTransition(async () => {
      const state = await compareExpensesAction(payload);
      setError(state.error ?? "");
      if (state.comparison) setResult(state.comparison);
    });
  }
  return (
    <section aria-label="Compare spending" className="min-w-0 space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Compare spending
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose two to six months, years, or yearly averages over year ranges.
          Compare like-for-like periods in separate currencies.
        </p>
      </div>
      <Card>
        <CardContent>
          <form
            onSubmit={submit}
            aria-label="Expense comparison"
            className="space-y-4"
          >
            <fieldset disabled={pending} className="min-w-0 space-y-4">
              <legend className="sr-only">Comparison periods</legend>
              <div className="max-w-xs space-y-2">
                <Label htmlFor={`${id}-kind`}>Compare</Label>
                <NativeSelect
                  id={`${id}-kind`}
                  value={selection.kind}
                  onChange={(event) => {
                    setSelection(
                      defaultComparison(year, asOf, event.target.value),
                    );
                    setError("");
                  }}
                >
                  {Object.entries(modes).map(([value, name]) => (
                    <NativeSelectOption key={value} value={value}>
                      {name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selection.periods.map((period, index) => (
                  <div
                    key={index}
                    className="flex min-w-0 items-end gap-2 rounded-lg border bg-background/50 p-3"
                  >
                    {selection.kind === "month" && (
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor={`${id}-month-${index}`}>
                          Month {index + 1}
                        </Label>
                        <NativeSelect
                          id={`${id}-month-${index}`}
                          value={period.month}
                          onChange={(event) =>
                            updatePeriod(index, "month", event.target.value)
                          }
                        >
                          {months.map((month, position) => (
                            <NativeSelectOption
                              key={month}
                              value={position + 1}
                            >
                              {month}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor={`${id}-year-${index}`}>
                        {selection.kind === "average" ? "From year" : "Year"}{" "}
                        {index + 1}
                      </Label>
                      <Input
                        id={`${id}-year-${index}`}
                        type="number"
                        min={1}
                        max={Number(asOf.slice(0, 4))}
                        step={1}
                        required
                        value={period.year}
                        onChange={(event) =>
                          updatePeriod(index, "year", event.target.value)
                        }
                      />
                    </div>
                    {selection.kind === "average" && (
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor={`${id}-end-year-${index}`}>
                          To year {index + 1}
                        </Label>
                        <Input
                          id={`${id}-end-year-${index}`}
                          type="number"
                          min={1}
                          max={Number(asOf.slice(0, 4))}
                          step={1}
                          required
                          value={period.end_year}
                          onChange={(event) =>
                            updatePeriod(index, "end_year", event.target.value)
                          }
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove period ${index + 1}`}
                      disabled={selection.periods.length <= 2}
                      onClick={() =>
                        setSelection((current) => ({
                          ...current,
                          periods: current.periods.filter(
                            (_, position) => position !== index,
                          ),
                        }))
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {selection.kind === "average"
                  ? "Yearly average = expenses across the inclusive year range divided by its number of years, including zero-spend years. The current year, if included, is partial and is not annualized. Values are rounded to 18 decimal places."
                  : "Only expenses due through today UTC count. Current months and years are partial; future periods cannot be compared."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={selection.periods.length >= 6}
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      periods: [
                        ...current.periods,
                        {
                          year: "",
                          ...(current.kind === "month" ? { month: 1 } : {}),
                          ...(current.kind === "average"
                            ? { end_year: "" }
                            : {}),
                        },
                      ],
                    }))
                  }
                >
                  <Plus aria-hidden="true" />
                  Add period
                </Button>
                <Button type="submit">
                  {pending ? "Comparing…" : "Compare periods"}
                </Button>
              </div>
            </fieldset>
            <Feedback state={{ error }} />
          </form>
        </CardContent>
      </Card>
      {result && <ComparisonResult comparison={result} />}
    </section>
  );
}
