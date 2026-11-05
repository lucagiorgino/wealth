import assert from "node:assert/strict";
import test from "node:test";
import { BackendError, fetchProfile } from "../lib/api-client.js";

const request = {
  baseUrl: "https://api.example.test",
  token: "server-only-token",
};

test("profile request keeps bearer token out of URL and disables cache and redirects", async () => {
  const profile = await fetchProfile({
    ...request,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.example.test/api/v1/me");
      assert.equal(options.headers.Authorization, "Bearer server-only-token");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      return Response.json({
        subject: "auth0|example",
        private_claim: "discard",
      });
    },
  });
  assert.deepEqual(profile, { subject: "auth0|example" });
});

test("backend refusal is surfaced rather than replaced with a fake profile", async () => {
  await assert.rejects(
    fetchProfile({
      ...request,
      fetchImpl: async () => new Response(null, { status: 401 }),
    }),
    (error) => error instanceof BackendError && error.status === 401,
  );
});

test("malformed and incomplete responses produce explicit gateway failures", async () => {
  for (const response of [
    new Response("<html>gateway error</html>"),
    Response.json({}),
    Response.json({ subject: " " }),
  ]) {
    await assert.rejects(
      fetchProfile({ ...request, fetchImpl: async () => response }),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
});

test("network failure produces an explicit service-unavailable error", async () => {
  await assert.rejects(
    fetchProfile({
      ...request,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    }),
    (error) => error instanceof BackendError && error.status === 503,
  );
});
