"use client";

import { useId, useState } from "react";
import { ChartBar, ChartColumn, ChartLine, ChartPie } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartViewToggle,
  ExactTooltipValue,
  shortLabel,
} from "@/components/expense-charts";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { negativeAmount } from "@/lib/assets";

const config = { value: { label: "Value", color: "var(--chart-1)" } };

function moneyScale(ticks, currency) {
  const labels = Object.fromEntries(
    ticks.map((tick) => [tick.value, tick.label]),
  );
  return {
    domain: [ticks[0].value, 10000],
    ticks: ticks.map((tick) => tick.value),
    tickFormatter: (value) => `${labels[value]} ${currency}`,
    tickLine: false,
    axisLine: false,
    tick: { fill: "var(--muted-foreground)" },
  };
}

function tooltip(currency) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => payload[0]?.payload.label}
          formatter={(_, __, point) => (
            <ExactTooltipValue
              color={point.payload.fill ?? point.color}
              amount={point.payload.amount}
              currency={currency}
            />
          )}
        />
      }
    />
  );
}

export function AssetCharts({ item }) {
  const [trendView, setTrendView] = useState("line");
  const [allocationView, setAllocationView] = useState("bar");
  const reasonId = useId();
  const points = item.allocation.map((point, index) => ({
    ...point,
    fill: `var(--chart-${(index % 5) + 1})`,
  }));
  const donutAvailable =
    !points.some((point) => negativeAmount(point.amount)) &&
    points.some((point) => point.value > 0);
  const donut = allocationView === "donut" && donutAvailable;
  const Plot = trendView === "line" ? LineChart : BarChart;
  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      <Card size="sm" className="min-w-0">
        <CardHeader className="min-h-11 items-center">
          <CardTitle className="flex min-h-11 items-center">
            <h3>Monthly net worth</h3>
          </CardTitle>
          <CardAction className="self-center">
            <ChartViewToggle
              label={`${item.currency} net worth chart view`}
              value={trendView}
              onChange={setTrendView}
              options={[
                { value: "line", label: "Line chart", icon: ChartLine },
                { value: "bar", label: "Bar chart", icon: ChartColumn },
              ]}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="min-w-0">
          <ChartContainer
            config={config}
            role="img"
            aria-label={`${item.currency} monthly net worth, currency amount scale`}
            className="h-60 w-full aspect-auto"
          >
            <Plot
              key={trendView}
              accessibilityLayer
              data={item.trend}
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
              <YAxis
                {...moneyScale(item.net_worth_ticks, item.currency)}
                width={96}
              />
              <ReferenceLine
                y={0}
                stroke="var(--foreground)"
                strokeWidth={1.5}
              />
              {tooltip(item.currency)}
              {trendView === "line" ? (
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : (
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={4}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              )}
            </Plot>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card size="sm" className="min-w-0">
        <CardHeader className="min-h-11 items-center">
          <CardTitle className="flex min-h-11 items-center">
            <h3>Asset allocation</h3>
          </CardTitle>
          <CardAction className="self-center">
            <ChartViewToggle
              label={`${item.currency} allocation chart view`}
              value={donut ? "donut" : "bar"}
              onChange={setAllocationView}
              options={[
                { value: "bar", label: "Bar chart", icon: ChartBar },
                {
                  value: "donut",
                  label: "Donut chart",
                  icon: ChartPie,
                  disabled: !donutAvailable,
                  description: !donutAvailable ? reasonId : undefined,
                },
              ]}
            />
          </CardAction>
          {!donutAvailable && (
            <p id={reasonId} className="sr-only">
              Donut view requires nonnegative asset groups and a visible
              positive value. Negative cash balances remain in the bar chart.
            </p>
          )}
        </CardHeader>
        <CardContent className="min-w-0">
          <ChartContainer
            config={config}
            role="img"
            aria-label={`${item.currency} asset allocation, excludes liabilities`}
            className="h-60 w-full aspect-auto"
          >
            {donut ? (
              <PieChart accessibilityLayer>
                {tooltip(item.currency)}
                <Pie
                  data={points}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="50%"
                  outerRadius="80%"
                  isAnimationActive={false}
                >
                  {points.map((point) => (
                    <Cell key={point.key} fill={point.fill} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <BarChart
                key="allocation-bar"
                accessibilityLayer
                data={points}
                layout="vertical"
                margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  {...moneyScale(item.allocation_ticks, item.currency)}
                  type="number"
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={112}
                  tickFormatter={shortLabel}
                  tick={{ fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine
                  x={0}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                />
                {tooltip(item.currency)}
                <Bar
                  dataKey="value"
                  radius={4}
                  maxBarSize={24}
                  isAnimationActive={false}
                >
                  {points.map((point) => (
                    <Cell key={point.key} fill={point.fill} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
