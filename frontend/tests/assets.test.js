import assert from "node:assert/strict";
import test from "node:test";
import { AssetInputError, assetId, assetPayload } from "../lib/assets.js";
import {
  BackendError,
  fetchAssetSummary,
  postAsset,
  putAssetValuation,
  removeAsset,
} from "../lib/api-client.js";

const id = "11111111-1111-4111-8111-111111111111";
const amount = "12345678901234567890.1234567890123456789";
const values = {
  opening: amount,
  months: Array(12).fill(amount),
  latest: amount,
};
const position = { id, name: "Fund", asset_group: "stocks", currency: "EUR" };
const ticks = [
  { value: 0, amount: "0", label: "0" },
  {
    value: 5000,
    amount: "6172839450617283945.06172839450617283945",
    label: "6.17e18",
  },
  { value: 10000, amount, label: "1.23e19" },
];
const summary = {
  year: 2024,
  as_of: "2026-11-04",
  currencies: [
    {
      currency: "EUR",
      assets: values,
      liabilities: { opening: "0", months: Array(12).fill("0"), latest: "0" },
      net_worth: values,
      change: values,
      change_percent: values,
      missing_values: Array(13).fill(0),
      groups: [
        {
          key: "stocks",
          label: "Stocks / ETF",
          values,
          holdings: [{ ...position, source: "asset", active: true, values }],
        },
      ],
      trend: Array.from({ length: 12 }, (_, i) => ({
        key: String(i + 1),
        label: `Month ${i + 1}`,
        amount,
        value: 10000,
      })),
      allocation: [
        { key: "stocks", label: "Stocks / ETF", amount, value: 10000 },
      ],
      net_worth_ticks: [
        { value: -10000, amount: `-${amount}`, label: "-1.23e19" },
        {
          value: -5000,
          amount: "-6172839450617283945.06172839450617283945",
          label: "-6.17e18",
        },
        ...ticks,
      ],
      allocation_ticks: ticks,
    },
  ],
};
const options = {
  baseUrl: "https://api.example.test",
  token: "asset-test-token",
};
const payload = {
  name: "Fund",
  asset_group: "stocks",
  currency: "EUR",
  date: "2024-01-31",
  amount,
};
const formFor = (data) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) form.set(key, value);
  return form;
};

test("asset payloads preserve exact money, zero and dated valuations; refuse invalid inputs", () => {
  assert.deepEqual(assetPayload(formFor(payload)), payload);
  assert.deepEqual(
    assetPayload(formFor({ date: payload.date, amount: "0" }), false),
    { date: payload.date, amount: "0" },
  );
  for (const changes of [
    { name: " " },
    { name: "x".repeat(101) },
    { asset_group: "bad" },
    { currency: "FAKE" },
    { amount: "-0.1" },
    { amount: "NaN" },
    { date: "9999-12-31" },
    { date: "2024-02-30" },
  ])
    assert.throws(
      () => assetPayload(formFor({ ...payload, ...changes })),
      AssetInputError,
    );
  assert.throws(() => assetId("../wallets"), AssetInputError);
});

test("asset report transport preserves exact strings, nulls and server geometry without exposing extra fields", async () => {
  const result = await fetchAssetSummary(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, `${options.baseUrl}/api/v1/assets?year=2024`);
        assert.equal(request.headers.Authorization, `Bearer ${options.token}`);
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        return Response.json({ ...summary, internal: "discard" });
      },
    },
    2024,
  );
  assert.deepEqual(result, summary);
  const partial = structuredClone(summary);
  partial.currencies[0].net_worth.months[11] = null;
  partial.currencies[0].trend[11] = {
    key: "12",
    label: "Dec",
    amount: null,
    value: null,
  };
  assert.deepEqual(
    await fetchAssetSummary(
      { ...options, fetchImpl: async () => Response.json(partial) },
      2024,
    ),
    partial,
  );
  for (const mutate of [
    (data) => {
      data.currencies[0].net_worth.latest = 10;
    },
    (data) => {
      data.currencies[0].net_worth.months.pop();
    },
    (data) => {
      data.currencies[0].trend[0].value = 10001;
    },
    (data) => {
      data.currencies[0].trend[0].amount = null;
    },
    (data) => {
      data.currencies[0].net_worth_ticks.pop();
    },
    (data) => {
      data.currencies[0].groups[0].holdings[0].source = "demo";
    },
    (data) => {
      data.currencies[0].groups[0].holdings[0].currency = "USD";
    },
    (data) => {
      data.currencies[0].groups[0].holdings[0].active = "true";
    },
    (data) => {
      data.currencies[0].missing_values[0] = -1;
    },
    (data) => {
      data.currencies[0].allocation[0].amount = "999";
    },
  ]) {
    const invalid = structuredClone(summary);
    mutate(invalid);
    await assert.rejects(
      fetchAssetSummary(
        { ...options, fetchImpl: async () => Response.json(invalid) },
        2024,
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
});

test("asset mutations use private transport and preserve explicit refusal paths", async () => {
  for (const [call, method, path, status, response] of [
    [(opts) => postAsset(opts, payload), "POST", "", 201, position],
    [
      (opts) => putAssetValuation(opts, id, { date: payload.date, amount }),
      "PUT",
      `/${id}/valuations`,
      204,
      null,
    ],
    [(opts) => removeAsset(opts, id), "DELETE", `/${id}`, 204, null],
  ]) {
    await call({
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, `${options.baseUrl}/api/v1/assets${path}`);
        assert.equal(request.method, method);
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        if (request.body) assert.equal(JSON.parse(request.body).amount, amount);
        return status === 204
          ? new Response(null, { status })
          : Response.json(response, { status });
      },
    });
    for (const status of [401, 404, 422, 503]) {
      await assert.rejects(
        call({
          ...options,
          fetchImpl: async () => new Response(null, { status }),
        }),
        (error) => error instanceof BackendError && error.status === status,
      );
    }
  }
});
