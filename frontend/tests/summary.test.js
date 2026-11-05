import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendError,
  fetchExpenseAnalysis,
  fetchExpenseSummary,
  postExpenseComparison,
} from "../lib/api-client.js";
import {
  comparisonPayload,
  defaultComparison,
  SummaryInputError,
  summaryView,
  summaryYear,
} from "../lib/summary.js";

const id = "11111111-1111-4111-8111-111111111111";
const totals = {
  months: ["12345678901234567890.123456789012345678", ...Array(11).fill("0")],
  total: "12345678901234567890.123456789012345678",
};
const fixture = {
  year: 2024,
  as_of: "2026-11-04",
  currencies: [
    {
      currency: "EUR",
      ...totals,
      categories: [
        {
          id,
          name: "Home",
          ...totals,
          subcategories: [{ id: null, name: "Without subcategory", ...totals }],
        },
      ],
    },
  ],
};
const options = {
  baseUrl: "https://api.example.test",
  token: "test-token",
  fetchImpl: async () => Response.json(fixture),
};

const analysis = {
  summary: fixture,
  income_summary: { year: fixture.year, as_of: fixture.as_of, currencies: [] },
  charts: [
    {
      currency: "EUR",
      ranking: [{ key: id, label: "Home", amount: totals.total, value: 10000 }],
      ranking_sum: totals.total,
      ranking_average: totals.total,
      totals: { expenses: totals.total, income: "0", net: `-${totals.total}` },
      cashflow_ticks: [
        { value: 0, amount: "0", label: "0" },
        {
          value: 5000,
          amount: "6172839450617283945.061728394506172839",
          label: "6.17e+18",
        },
        { value: 10000, amount: totals.total, label: "1.23e+19" },
      ],
      net_ticks: [
        { value: -10000, amount: `-${totals.total}`, label: "-1.23e+19" },
        {
          value: -5000,
          amount: "-6172839450617283945.061728394506172839",
          label: "-6.17e+18",
        },
        { value: 0, amount: "0", label: "0" },
        {
          value: 5000,
          amount: "6172839450617283945.061728394506172839",
          label: "6.17e+18",
        },
        { value: 10000, amount: totals.total, label: "1.23e+19" },
      ],
      trend: totals.months.map((amount, index) => ({
        key: String(index + 1),
        label: `Month ${index + 1}`,
        amount,
        value: index === 0 ? 10000 : 0,
      })),
      income_trend: totals.months.map((_, index) => ({
        key: String(index + 1),
        label: `Month ${index + 1}`,
        amount: "0",
        value: 0,
      })),
      net_trend: totals.months.map((amount, index) => ({
        key: String(index + 1),
        label: `Month ${index + 1}`,
        amount: index === 0 ? `-${amount}` : "0",
        value: index === 0 ? -10000 : 0,
      })),
    },
  ],
};
const comparisonRequest = {
  kind: "month",
  periods: [
    { year: 2024, month: 1 },
    { year: 2024, month: 2 },
  ],
};
const comparison = {
  kind: "month",
  as_of: "2026-11-04",
  periods: comparisonRequest.periods.map((period, index) => ({
    ...period,
    key: `p${index}`,
    label: `${index + 1} / 2024`,
    months: 1,
    years: 1,
    end_year: null,
  })),
  currencies: [
    {
      currency: "EUR",
      totals: [
        { key: "p0", label: "1 / 2024", amount: totals.total, value: 10000 },
        { key: "p1", label: "2 / 2024", amount: "0", value: 0 },
      ],
      categories: [
        {
          id,
          name: "Home",
          points: [
            {
              key: "p0",
              label: "1 / 2024",
              amount: totals.total,
              value: 10000,
            },
            { key: "p1", label: "2 / 2024", amount: "0", value: 0 },
          ],
        },
      ],
    },
  ],
};

test("annual and comparison responses preserve negative exact expenses and signed coordinates", async () => {
  const signed = structuredClone(analysis);
  const expense = "-12345678901234567890.123456789012345678";
  const currency = signed.summary.currencies[0];
  for (const item of [
    currency,
    currency.categories[0],
    currency.categories[0].subcategories[0],
  ]) {
    item.total = expense;
    item.months[0] = expense;
  }
  for (const point of [
    signed.charts[0].ranking[0],
    signed.charts[0].trend[0],
  ]) {
    point.amount = expense;
    point.value = -10000;
  }
  signed.charts[0].net_trend[0].amount = totals.total;
  signed.charts[0].net_trend[0].value = 10000;
  signed.charts[0].ranking_sum = expense;
  signed.charts[0].ranking_average = expense;
  signed.charts[0].totals = {
    expenses: expense,
    income: "0",
    net: totals.total,
  };
  signed.charts[0].cashflow_ticks = structuredClone(signed.charts[0].net_ticks);
  assert.deepEqual(
    await fetchExpenseAnalysis(
      { ...options, fetchImpl: async () => Response.json(signed) },
      2024,
    ),
    signed,
  );
  const compared = structuredClone(comparison);
  for (const point of [
    compared.currencies[0].totals[0],
    compared.currencies[0].categories[0].points[0],
  ]) {
    point.amount = expense;
    point.value = -10000;
  }
  assert.deepEqual(
    await postExpenseComparison(
      { ...options, fetchImpl: async () => Response.json(compared) },
      comparisonRequest,
    ),
    compared,
  );
});

test("comparison controls build bounded distinct same-kind periods without monetary arithmetic", () => {
  assert.deepEqual(comparisonPayload(comparisonRequest), comparisonRequest);
  assert.deepEqual(
    comparisonPayload({
      kind: "average",
      periods: [
        { year: "2022", end_year: "2024" },
        { year: "2019", end_year: "2021" },
      ],
    }),
    {
      kind: "average",
      periods: [
        { year: 2022, end_year: 2024, month: null },
        { year: 2019, end_year: 2021, month: null },
      ],
    },
  );
  assert.deepEqual(defaultComparison(2026, "2026-01-02").periods, [
    { year: 2026, month: 1 },
    { year: 2025, month: 12 },
  ]);
  assert.deepEqual(defaultComparison(9999, "2026-03-02", "average").periods, [
    { year: 2024, end_year: 2026 },
    { year: 2021, end_year: 2023 },
  ]);
  for (const data of [
    { ...comparisonRequest, owner_subject: id },
    { ...comparisonRequest, periods: [comparisonRequest.periods[0]] },
    { ...comparisonRequest, periods: Array(7).fill({ year: 2024, month: 1 }) },
    { ...comparisonRequest, periods: Array(2).fill({ year: 2024, month: 1 }) },
    { ...comparisonRequest, periods: [{ year: 2024 }, { year: 2023 }] },
    {
      ...comparisonRequest,
      periods: [
        { year: 2024, month: 0 },
        { year: 2023, month: 1 },
      ],
    },
    {
      ...comparisonRequest,
      periods: [
        { year: "1e3", month: 1 },
        { year: 2023, month: 1 },
      ],
    },
    { ...comparisonRequest, kind: "year" },
    { kind: "average", periods: [{ year: 2024 }, { year: 2023 }] },
    {
      kind: "average",
      periods: [
        { year: 2024, end_year: 2023 },
        { year: 2021, end_year: 2022 },
      ],
    },
    {
      kind: "average",
      periods: [
        { year: 2024, end_year: "1e3" },
        { year: 2021, end_year: 2022 },
      ],
    },
  ])
    assert.throws(() => comparisonPayload(data), SummaryInputError);
});

test("analysis and comparison requests retain exact money, private transport and sanitized geometry", async () => {
  const result = await fetchExpenseAnalysis(
    {
      ...options,
      fetchImpl: async (url, init) => {
        assert.equal(
          url,
          "https://api.example.test/api/v1/summary/analysis?year=2024",
        );
        assert.equal(init.cache, "no-store");
        assert.equal(init.redirect, "error");
        return Response.json(analysis);
      },
    },
    2024,
  );
  assert.deepEqual(result, analysis);
  const compared = await postExpenseComparison(
    {
      ...options,
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://api.example.test/api/v1/summary/compare");
        assert.equal(init.method, "POST");
        assert.equal(init.cache, "no-store");
        assert.equal(init.redirect, "error");
        assert.deepEqual(JSON.parse(init.body), comparisonRequest);
        const data = structuredClone(comparison);
        data.currencies[0].categories[0].owner_subject = "forged";
        return Response.json(data);
      },
    },
    comparisonRequest,
  );
  assert.deepEqual(compared, comparison);
  assert.equal(compared.currencies[0].totals[0].amount, totals.total);
});

test("analysis refuses malformed or inconsistent chart geometry and amounts", async () => {
  for (const change of [
    (data) => {
      data.charts = [];
    },
    (data) => {
      data.charts[0].currency = "USD";
    },
    (data) => {
      data.charts[0].ranking[0].amount = 2;
    },
    (data) => {
      data.charts[0].ranking[0].amount = "0.1";
    },
    (data) => {
      data.charts[0].ranking[0].value = 10001;
    },
    (data) => {
      data.charts[0].ranking[0].key = "forged";
    },
    (data) => {
      data.charts[0].trend.pop();
    },
    (data) => {
      data.charts[0].trend[0].amount = "Infinity";
    },
    (data) => {
      delete data.income_summary;
    },
    (data) => {
      data.income_summary.as_of = "2024-01-01";
    },
    (data) => {
      data.charts[0].income_trend[0].amount = "1";
    },
    (data) => {
      data.charts[0].income_trend.pop();
    },
    (data) => {
      data.charts[0].net_trend[0].amount = 1;
    },
    (data) => {
      data.charts[0].net_trend[0].value = -10001;
    },
    (data) => {
      delete data.charts[0].ranking_sum;
    },
    (data) => {
      data.charts[0].ranking_average = 1;
    },
    (data) => {
      delete data.charts[0].totals;
    },
    (data) => {
      data.charts[0].totals.expenses = "1";
    },
    (data) => {
      data.charts[0].totals.net = "NaN";
    },
    (data) => {
      delete data.charts[0].cashflow_ticks;
    },
    (data) => {
      data.charts[0].cashflow_ticks[1].amount = 0.1;
    },
    (data) => {
      data.charts[0].net_ticks[0].label = "100%";
    },
    (data) => {
      data.charts[0].net_ticks[1].value = -4999;
    },
  ]) {
    const data = structuredClone(analysis);
    change(data);
    await assert.rejects(
      fetchExpenseAnalysis(
        { ...options, fetchImpl: async () => Response.json(data) },
        2024,
      ),
      BackendError,
    );
  }
});

test("annual income-only currencies retain exact tables and aligned cash flow charts", async () => {
  const data = structuredClone(analysis);
  data.income_summary = structuredClone(fixture);
  data.summary.currencies = [];
  data.charts[0].ranking = [];
  data.charts[0].ranking_sum = "0";
  data.charts[0].ranking_average = "0";
  data.charts[0].totals = {
    expenses: "0",
    income: totals.total,
    net: totals.total,
  };
  data.charts[0].income_trend = structuredClone(data.charts[0].trend);
  data.charts[0].net_trend = structuredClone(data.charts[0].trend);
  data.charts[0].trend = data.charts[0].trend.map((point) => ({
    ...point,
    amount: "0",
    value: 0,
  }));
  const optionsFor = (response) => ({
    ...options,
    fetchImpl: async () => Response.json(response),
  });

  test("current-year charts require January through December while retaining the due cutoff", async () => {
    const data = structuredClone(analysis);
    data.summary.year = data.income_summary.year = 2026;
    const response = () => ({
      ...options,
      fetchImpl: async () => Response.json(data),
    });
    assert.deepEqual(await fetchExpenseAnalysis(response(), 2026), data);
    for (const key of ["trend", "income_trend", "net_trend"])
      data.charts[0][key].pop();
    await assert.rejects(fetchExpenseAnalysis(response(), 2026), BackendError);
  });
  assert.deepEqual(await fetchExpenseAnalysis(optionsFor(data), 2024), data);
  const invalid = structuredClone(data);
  invalid.income_summary.currencies[0].months[0] = "-1";
  await assert.rejects(
    fetchExpenseAnalysis(optionsFor(invalid), 2024),
    BackendError,
  );
});

test("comparisons refuse invalid period metadata and financial values rather than inventing zeros", async () => {
  for (const change of [
    (data) => {
      data.kind = "average";
    },
    (data) => {
      data.periods[0].months = 0;
    },
    (data) => {
      data.periods[0].years = 2;
    },
    (data) => {
      data.periods[0].end_year = 2025;
    },
    (data) => {
      data.periods[0].year = 2023;
    },
    (data) => {
      data.periods.reverse();
    },
    (data) => {
      data.currencies[0].totals[0].amount = 1.5;
    },
    (data) => {
      data.currencies[0].totals[0].value = 1.5;
    },
    (data) => {
      data.currencies[0].categories[0].points.pop();
    },
    (data) => {
      data.currencies[0].categories.push(data.currencies[0].categories[0]);
    },
    (data) => {
      data.currencies[0].categories[0].points[0].value = -10001;
    },
  ]) {
    const data = structuredClone(comparison);
    change(data);
    await assert.rejects(
      postExpenseComparison(
        { ...options, fetchImpl: async () => Response.json(data) },
        comparisonRequest,
      ),
      BackendError,
    );
  }
  for (const status of [401, 422, 503]) {
    await assert.rejects(
      postExpenseComparison(
        { ...options, fetchImpl: async () => Response.json({}, { status }) },
        comparisonRequest,
      ),
      (error) => error instanceof BackendError && error.status === status,
    );
  }
});

test("summary year defaults to UTC and rejects malformed or repeated query values", () => {
  assert.equal(summaryView({}, "2026-01-01"), 2026);
  assert.equal(summaryView({ year: "2024" }, "2026-01-01"), 2024);
  assert.equal(summaryYear("1"), 1);
  assert.equal(summaryYear("9999"), 9999);
  for (const year of [
    "0",
    "10000",
    "",
    "2.5",
    "-1",
    "1e3",
    ["2024", "2025"],
    2024,
    null,
  ])
    assert.throws(() => summaryView({ year }, "2026-01-01"), SummaryInputError);
  assert.throws(
    () => summaryView({ year: "2024", owner: id }, "2026-01-01"),
    SummaryInputError,
  );
});

test("annual expense requests remain private, retain exact strings, and remove unknown owner fields", async () => {
  const result = await fetchExpenseSummary(
    {
      ...options,
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://api.example.test/api/v1/summary?year=2024");
        assert.equal(init.cache, "no-store");
        assert.equal(init.redirect, "error");
        assert.equal(init.headers.Authorization, "Bearer test-token");
        const data = structuredClone(fixture);
        data.owner_subject = "forged";
        data.currencies[0].categories[0].subcategories[0].owner_subject =
          "forged";
        return Response.json(data);
      },
    },
    2024,
  );
  assert.deepEqual(result, fixture);
  assert.equal(result.currencies[0].months[0], totals.total);
  assert.deepEqual(
    await fetchExpenseSummary(
      {
        ...options,
        fetchImpl: async () =>
          Response.json({ year: 2024, as_of: "2026-11-04", currencies: [] }),
      },
      2024,
    ),
    { year: 2024, as_of: "2026-11-04", currencies: [] },
  );
});

test("annual expense responses refuse invalid money, dates, currencies and hierarchy", async () => {
  const changes = [
    (data) => {
      data.year = 2025;
    },
    (data) => {
      data.as_of = "2026-02-30";
    },
    (data) => {
      data.currencies = null;
    },
    (data) => {
      data.currencies.push(data.currencies[0]);
    },
    (data) => {
      data.currencies[0].currency = "INVALID";
    },
    (data) => {
      data.currencies[0].months.pop();
    },
    (data) => {
      data.currencies[0].months[0] = 1.5;
    },
    (data) => {
      data.currencies[0].total = "--1";
    },
    (data) => {
      data.currencies[0].total = "NaN";
    },
    (data) => {
      data.currencies[0].categories = [null];
    },
    (data) => {
      data.currencies[0].categories = [];
    },
    (data) => {
      data.currencies[0].categories.push(data.currencies[0].categories[0]);
    },
    (data) => {
      data.currencies[0].categories[0].id = "invalid";
    },
    (data) => {
      data.currencies[0].categories[0].subcategories[0].name = "";
    },
    (data) => {
      data.currencies[0].categories[0].subcategories[0].total = "Infinity";
    },
    (data) => {
      data.currencies[0].categories[0].subcategories.push(
        data.currencies[0].categories[0].subcategories[0],
      );
    },
  ];
  for (const change of changes) {
    const data = structuredClone(fixture);
    change(data);
    await assert.rejects(
      fetchExpenseSummary(
        { ...options, fetchImpl: async () => Response.json(data) },
        2024,
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
  for (const status of [401, 422, 503])
    await assert.rejects(
      fetchExpenseSummary(
        { ...options, fetchImpl: async () => Response.json({}, { status }) },
        2024,
      ),
      (error) => error instanceof BackendError && error.status === status,
    );
});
