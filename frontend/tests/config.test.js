import assert from "node:assert/strict";
import test from "node:test";
import { backendOrigin, missingAuthSettings } from "../lib/config.js";

test("blank Auth0 values are reported as missing", () => {
  const missing = missingAuthSettings({ AUTH0_DOMAIN: "  " });
  assert.ok(missing.includes("AUTH0_DOMAIN"));
  assert.ok(missing.includes("AUTH0_SECRET"));
});

test("local Docker backend is allowed only in explicit development", () => {
  assert.equal(
    backendOrigin({
      APP_ENV: "development",
      BACKEND_API_URL: "http://backend:8000",
    }),
    "http://backend:8000",
  );
  assert.throws(() =>
    backendOrigin({ BACKEND_API_URL: "http://backend:8000" }),
  );
});

test("backend accepts HTTPS origins but rejects credential and path confusion", () => {
  assert.equal(
    backendOrigin({ BACKEND_API_URL: "https://api.example.test/" }),
    "https://api.example.test",
  );
  for (const url of [
    "http://remote.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/api",
    "https://api.example.test/?token=private",
    "https://api.example.test/#fragment",
  ]) {
    assert.throws(() =>
      backendOrigin({ APP_ENV: "development", BACKEND_API_URL: url }),
    );
  }
});
