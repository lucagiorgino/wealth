import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSidebarOrder,
  settingsPayload,
  SettingsInputError,
} from "../lib/settings.js";
import { BackendError, fetchSettings, putSettings } from "../lib/api-client.js";

const request = {
  baseUrl: "https://api.example.test",
  token: "settings-test-token",
};
const settings = {
  theme: "dark",
  sidebar_order: [...defaultSidebarOrder].reverse(),
};

function formFor(data) {
  const form = new FormData();
  form.set("theme", data.theme);
  for (const id of data.sidebar_order) form.append("sidebar_order", id);
  return form;
}

test("settings payload preserves the chosen theme and complete feature order", () => {
  assert.deepEqual(settingsPayload(formFor(settings)), settings);
  for (const invalid of [
    { ...settings, theme: "system" },
    { ...settings, sidebar_order: ["dashboard"] },
    {
      ...settings,
      sidebar_order: [
        "dashboard",
        "wallets",
        "transactions",
        "summary",
        "summary",
        "categories",
      ],
    },
    {
      ...settings,
      sidebar_order: [
        "dashboard",
        "wallets",
        "transactions",
        "summary",
        "comparison",
        "account",
      ],
    },
  ]) {
    assert.throws(() => settingsPayload(formFor(invalid)), SettingsInputError);
  }
});

test("settings transport is authenticated, uncached and validates read/write responses", async () => {
  for (const [call, method] of [
    [fetchSettings, "GET"],
    [putSettings, "PUT"],
  ]) {
    const result = await call(
      {
        ...request,
        fetchImpl: async (url, options) => {
          assert.equal(url, `${request.baseUrl}/api/v1/settings`);
          assert.equal(options.method, method);
          assert.equal(
            options.headers.Authorization,
            `Bearer ${request.token}`,
          );
          assert.equal(options.cache, "no-store");
          assert.equal(options.redirect, "error");
          if (method === "PUT")
            assert.deepEqual(JSON.parse(options.body), settings);
          return Response.json({ ...settings, internal: "discard" });
        },
      },
      settings,
    );
    assert.deepEqual(result, settings);
    for (const invalid of [
      null,
      {},
      { ...settings, theme: "system" },
      { ...settings, sidebar_order: Array(6).fill("dashboard") },
      {
        ...settings,
        sidebar_order: [
          "dashboard",
          "wallets",
          "transactions",
          "summary",
          "summary",
          "categories",
        ],
      },
    ]) {
      await assert.rejects(
        call(
          {
            ...request,
            fetchImpl: async () => Response.json(invalid),
          },
          settings,
        ),
        (error) => error instanceof BackendError && error.status === 502,
      );
    }
    for (const status of [401, 422, 503]) {
      await assert.rejects(
        call(
          {
            ...request,
            fetchImpl: async () => new Response(null, { status }),
          },
          settings,
        ),
        (error) => error instanceof BackendError && error.status === status,
      );
    }
  }
});
