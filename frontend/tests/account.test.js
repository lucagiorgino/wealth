import assert from "node:assert/strict";
import test from "node:test";
import { avatarPng } from "./account-fixtures.js";
import {
  AccountInputError,
  accountPayload,
  profilePicturePayload,
  validateAvatarFile,
  avatarMaxBytes,
} from "../lib/account.js";
import {
  BackendError,
  fetchAccount,
  putAccount,
  patchAccountName,
  putAccountIcon,
  putAccountAvatar,
  removeAccountAvatar,
} from "../lib/api-client.js";

const options = {
  baseUrl: "https://api.example.test",
  token: "server-only-token",
};
const account = {
  subject: "auth0|account-test",
  display_name: "Alex",
  icon: "cat",
  avatar_url: null,
};

function form(displayName = "Alex", icon = "cat") {
  const data = new FormData();
  data.set("display_name", displayName);
  data.set("icon", icon);
  return data;
}

test("account input trims names and excludes forged identity and provider fields", () => {
  const data = form("  Alex  ");
  data.set("subject", "another-user");
  data.set("email", "not-editable@example.test");
  assert.deepEqual(accountPayload(data), { display_name: "Alex" });
  assert.equal(
    accountPayload(form("\u{1F600}".repeat(100))).display_name,
    "\u{1F600}".repeat(100),
  );
});

test("invalid account names produce explicit form errors", () => {
  for (const data of [
    form(""),
    form(" "),
    form("x".repeat(101)),
    form("\u{1F600}".repeat(101)),
    new FormData(),
  ]) {
    assert.throws(() => accountPayload(data), AccountInputError);
  }
});

test("one profile picture choice selects either a supported icon or a validated image", () => {
  const data = new FormData();
  const file = new File([avatarPng], "avatar.png", { type: "image/png" });
  data.set("picture", "custom");
  assert.throws(() => profilePicturePayload(data), AccountInputError);
  data.set("avatar", file);
  assert.deepEqual(profilePicturePayload(data), { kind: "image", file });
  data.set("picture", "cat");
  assert.deepEqual(profilePicturePayload(data), { kind: "icon", icon: "cat" });
  for (const value of ["unsupported", "", file]) {
    data.set("picture", value);
    assert.throws(() => profilePicturePayload(data), AccountInputError);
  }
});

test("name and icon saves use independent private mutations and preserve explicit failures", async () => {
  const cases = [
    {
      save: patchAccountName,
      input: { display_name: "Alex" },
      path: "/api/v1/account",
      method: "PATCH",
      body: { display_name: "Alex" },
    },
    {
      save: putAccountIcon,
      input: "cat",
      path: "/api/v1/account/icon",
      method: "PUT",
      body: { icon: "cat" },
    },
  ];
  for (const { save, input, path, method, body } of cases) {
    assert.deepEqual(
      await save(
        {
          ...options,
          fetchImpl: async (url, request) => {
            assert.equal(url, `${options.baseUrl}${path}`);
            assert.equal(request.method, method);
            assert.equal(request.cache, "no-store");
            assert.equal(request.redirect, "error");
            assert.deepEqual(JSON.parse(request.body), body);
            return Response.json(account);
          },
        },
        input,
      ),
      account,
    );
    for (const status of [401, 422, 503]) {
      await assert.rejects(
        save(
          {
            ...options,
            fetchImpl: async () => new Response(null, { status }),
          },
          input,
        ),
        (error) => error instanceof BackendError && error.status === status,
      );
    }
  }
});

test("account reads stay server-side and accept only valid profile responses", async () => {
  assert.deepEqual(
    await fetchAccount({
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, "https://api.example.test/api/v1/account");
        assert.equal(request.headers.Authorization, "Bearer server-only-token");
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        return Response.json(account);
      },
    }),
    account,
  );
  assert.deepEqual(
    await fetchAccount({
      ...options,
      fetchImpl: async () =>
        Response.json({ ...account, display_name: null, icon: "user-round" }),
    }),
    { ...account, display_name: null, icon: "user-round" },
  );
  for (const data of [
    {},
    { ...account, subject: "" },
    { ...account, display_name: "" },
    { ...account, display_name: 123 },
    { ...account, icon: "unsupported" },
    { ...account, avatar_url: "https://untrusted.example.test/avatar.png" },
    { ...account, avatar_url: "data:image/svg+xml;base64,PHN2Zz4=" },
  ]) {
    await assert.rejects(
      fetchAccount({
        ...options,
        fetchImpl: async () => Response.json(data),
      }),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
});

test("avatar imports validate file type and size and forward bounded binary bodies without tokens in URLs", async () => {
  const png = avatarPng;
  const file = new File([png], "avatar.png", { type: "image/png" });
  assert.equal(validateAvatarFile(file), file);
  for (const invalid of [
    null,
    new File([], "empty.png", { type: "image/png" }),
    new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(avatarMaxBytes + 1)], "large.png", {
      type: "image/png",
    }),
  ])
    assert.throws(() => validateAvatarFile(invalid), AccountInputError);
  const saved = {
    ...account,
    avatar_url: `data:image/png;base64,${png.toString("base64")}`,
  };
  assert.deepEqual(
    await putAccountAvatar(
      {
        ...options,
        fetchImpl: async (url, request) => {
          assert.equal(url, "https://api.example.test/api/v1/account/avatar");
          assert.equal(request.method, "PUT");
          assert.equal(request.headers["Content-Type"], "image/png");
          assert.equal(request.body, file);
          assert.equal(request.redirect, "error");
          assert.equal(request.cache, "no-store");
          return Response.json(saved);
        },
      },
      file,
    ),
    saved,
  );
  assert.deepEqual(
    await removeAccountAvatar({
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, "https://api.example.test/api/v1/account/avatar");
        assert.equal(request.method, "DELETE");
        return Response.json(account);
      },
    }),
    account,
  );
  for (const status of [401, 413, 415, 422, 503]) {
    await assert.rejects(
      putAccountAvatar(
        {
          ...options,
          fetchImpl: async () => new Response(null, { status }),
        },
        file,
      ),
      (error) => error instanceof BackendError && error.status === status,
    );
  }
});

test("account saves use PUT and preserve explicit backend failures", async () => {
  const payload = { display_name: "Alex", icon: "cat" };
  assert.deepEqual(
    await putAccount(
      {
        ...options,
        fetchImpl: async (url, request) => {
          assert.equal(url, "https://api.example.test/api/v1/account");
          assert.equal(request.method, "PUT");
          assert.equal(request.cache, "no-store");
          assert.equal(request.redirect, "error");
          assert.deepEqual(JSON.parse(request.body), payload);
          return Response.json(account);
        },
      },
      payload,
    ),
    account,
  );
  for (const status of [401, 422, 503]) {
    await assert.rejects(
      putAccount(
        {
          ...options,
          fetchImpl: async () => new Response(null, { status }),
        },
        payload,
      ),
      (error) => {
        assert.equal(error.status, status);
        if (status === 422)
          assert.equal(
            error.message,
            "Check the display name and profile icon.",
          );
        return error instanceof BackendError;
      },
    );
  }
});
