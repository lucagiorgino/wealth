import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendError,
  fetchWallets,
  postWallet,
  postWalletIconPreview,
  putWallet,
  removeWallet,
} from "../lib/api-client.js";
import {
  WalletInputError,
  faviconUrl,
  walletId,
  walletPage,
  walletPayload,
  walletCurrencyOptions,
} from "../lib/wallets.js";
import { avatarPng } from "./account-fixtures.js";

const options = {
  baseUrl: "https://api.example.test",
  token: "server-only-token",
};
const wallet = {
  id: "c774315e-8ff1-4dbe-aa01-b859d50b506f",
  name: "Savings",
  colour: "#3b82f6",
  icon: "piggy-bank",
  type: "bank",
  icon_image_url: null,
  initial_amount: "12345678901234567890.123456789012345678",
  current_amount: "12345678901234567890.123456789012345679",
  currency: "EUR",
  balance_as_of: "2026-11-04",
};

function form(amount) {
  const data = new FormData();
  for (const field of ["name", "colour", "icon"])
    data.set(field, wallet[field]);
  if (amount !== undefined) data.set("initial_amount", amount);
  return data;
}

test("wallet form preserves exact amounts and leaves blank amounts to the API default", () => {
  assert.equal(
    walletPayload(form(wallet.initial_amount)).initial_amount,
    wallet.initial_amount,
  );
  assert.equal("initial_amount" in walletPayload(form("")), false);
  assert.equal("initial_amount" in walletPayload(form()), false);
  const forged = form();
  forged.set("owner_subject", "someone-else");
  assert.equal("owner_subject" in walletPayload(forged), false);
});

test("invalid amounts and missing display attributes produce form errors", () => {
  for (const amount of ["NaN", "Infinity", "1,23", "not-an-amount"]) {
    assert.throws(() => walletPayload(form(amount)), WalletInputError);
  }
  const missing = form();
  missing.delete("name");
  assert.throws(() => walletPayload(missing), WalletInputError);
});

test("wallet creation posts decimal strings server-side without caching or following redirects", async () => {
  const payload = walletPayload(form(wallet.initial_amount));
  const result = await postWallet(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, "https://api.example.test/api/v1/wallets");
        assert.equal(request.method, "POST");
        assert.equal(request.headers.Authorization, "Bearer server-only-token");
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        assert.deepEqual(JSON.parse(request.body), payload);
        return Response.json(wallet, { status: 201 });
      },
    },
    payload,
  );
  assert.deepEqual(result, wallet);
});

test("wallet listing preserves exact decimal strings and refuses malformed data", async () => {
  const listing = { wallets: [wallet], page: 2, page_size: 10, total: 11 };
  assert.deepEqual(
    await fetchWallets(
      {
        ...options,
        fetchImpl: async (url, request) => {
          assert.equal(
            url,
            "https://api.example.test/api/v1/wallets?page=2&page_size=10",
          );
          assert.equal(request.cache, "no-store");
          assert.equal(request.redirect, "error");
          return Response.json(listing);
        },
      },
      2,
    ),
    listing,
  );
  for (const data of [
    {},
    { ...listing, page: 1 },
    { ...listing, page_size: 100 },
    { ...listing, total: -1 },
    { ...listing, total: "11" },
    { ...listing, total: 12 },
    { ...listing, wallets: [{ ...wallet, initial_amount: 0.1 }] },
    { ...listing, wallets: [{ ...wallet, current_amount: 0.1 }] },
    { ...listing, wallets: [{ ...wallet, currency: "XYZ" }] },
    { ...listing, wallets: [{ ...wallet, balance_as_of: "2026-02-30" }] },
    { ...listing, wallets: [{ ...wallet, type: "cash" }] },
    {
      ...listing,
      wallets: [{ ...wallet, icon_image_url: "https://example.com/icon.png" }],
    },
    { ...listing, wallets: [{ ...wallet, icon: "custom" }] },
  ]) {
    await assert.rejects(
      fetchWallets(
        {
          ...options,
          fetchImpl: async () => Response.json(data),
        },
        2,
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
});

test("wallet form offers six named currencies and persists wallet type and favicon URLs", () => {
  assert.deepEqual(
    walletCurrencyOptions.map((option) => option.value),
    ["EUR", "USD", "GBP", "BTC", "ETH", "ITL"],
  );
  for (const currency of walletCurrencyOptions) {
    const data = form("0.000000000000000001");
    data.set("currency", currency.value);
    data.set("type", "exchange");
    data.set("icon", "custom");
    data.set("favicon_url", "https://example.com/favicon.ico");
    assert.deepEqual(walletPayload(data), {
      name: wallet.name,
      colour: wallet.colour,
      icon: "custom",
      type: "exchange",
      currency: currency.value,
      initial_amount: "0.000000000000000001",
      favicon_url: "https://example.com/favicon.ico",
    });
    data.set("favicon_url", "");
    assert.equal("favicon_url" in walletPayload(data), false);
  }
  const data = form();
  data.set("type", "cash");
  assert.throws(() => walletPayload(data), WalletInputError);
  data.set("type", "bank");
  data.set("icon", "custom");
  for (const url of [
    "http://example.com/a.ico",
    "https://user:pass@example.com/a",
    "https://example.com:8443/a",
    "not-a-url",
  ]) {
    data.set("favicon_url", url);
    assert.throws(() => walletPayload(data), WalletInputError);
  }
});

test("wallet currency defaults to EUR and rejects invalid selections and mutation IDs", () => {
  assert.equal(walletPayload(form()).currency, "EUR");
  const data = form();
  data.set("currency", " usd ");
  assert.equal(walletPayload(data).currency, "USD");
  for (const currency of ["", "XYZ", "€"]) {
    data.set("currency", currency);
    assert.throws(() => walletPayload(data), WalletInputError);
  }
  assert.equal(walletId(wallet.id), wallet.id);
  for (const id of ["../account", null, "not-a-wallet"]) {
    assert.throws(() => walletId(id), WalletInputError);
  }
});

test("wallet edits and deletes preserve exact data and return meaningful protected-wallet refusals", async () => {
  const result = await putWallet(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, `${options.baseUrl}/api/v1/wallets/${wallet.id}`);
        assert.equal(request.method, "PUT");
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        assert.equal(
          JSON.parse(request.body).initial_amount,
          wallet.initial_amount,
        );
        return Response.json(wallet);
      },
    },
    wallet.id,
    walletPayload(form(wallet.initial_amount)),
  );
  assert.deepEqual(result, wallet);
  await removeWallet(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, `${options.baseUrl}/api/v1/wallets/${wallet.id}`);
        assert.equal(request.method, "DELETE");
        assert.equal(request.cache, "no-store");
        return new Response(null, { status: 204 });
      },
    },
    wallet.id,
  );
  const refused = {
    ...options,
    fetchImpl: async () => new Response(null, { status: 409 }),
  };
  await assert.rejects(
    putWallet(refused, wallet.id, {}),
    /Currency cannot change/,
  );
  await assert.rejects(
    removeWallet(refused, wallet.id),
    /wallet is used by transactions/,
  );
});

test("wallet pages reject malformed, repeated, and out-of-range parameters", () => {
  assert.equal(walletPage(), 1);
  assert.equal(walletPage("2"), 2);
  for (const value of ["", "0", "-1", "1.5", "abc", "2147483648", ["1", "2"]]) {
    assert.throws(() => walletPage(value), WalletInputError);
  }
});

test("wallet validation failures are surfaced rather than pretending a save succeeded", async () => {
  await assert.rejects(
    postWallet(
      {
        ...options,
        fetchImpl: async () => new Response(null, { status: 422 }),
      },
      walletPayload(form()),
    ),
    (error) => error instanceof BackendError && error.status === 422,
  );
});

test("favicon previews use private server-side POSTs and accept only normalized PNG data", async () => {
  const image = `data:image/png;base64,${avatarPng.toString("base64")}`;
  assert.equal(
    await postWalletIconPreview(
      {
        ...options,
        fetchImpl: async (url, request) => {
          assert.equal(url, `${options.baseUrl}/api/v1/wallets/icon-preview`);
          assert.equal(request.method, "POST");
          assert.equal(request.cache, "no-store");
          assert.equal(request.redirect, "error");
          assert.equal(
            request.headers.Authorization,
            `Bearer ${options.token}`,
          );
          assert.deepEqual(JSON.parse(request.body), {
            favicon_url: "https://example.com/favicon.ico",
          });
          return Response.json({ icon_image_url: image });
        },
      },
      " https://example.com/favicon.ico ",
    ),
    image,
  );

  for (const data of [
    {},
    { icon_image_url: null },
    { icon_image_url: "https://example.com/favicon.ico" },
  ]) {
    await assert.rejects(
      postWalletIconPreview(
        {
          ...options,
          fetchImpl: async () => Response.json(data),
        },
        "https://example.com/favicon.ico",
      ),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
  await assert.rejects(
    postWalletIconPreview(
      {
        ...options,
        fetchImpl: async () => new Response(null, { status: 422 }),
      },
      "https://example.com/favicon.ico",
    ),
    /favicon could not be loaded/,
  );
  for (const url of [
    "",
    null,
    "http://example.com/favicon.ico",
    "https://example.com/icon#fragment",
  ]) {
    assert.throws(() => faviconUrl(url), WalletInputError);
  }
});
