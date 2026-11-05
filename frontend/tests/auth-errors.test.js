import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessTokenError,
  AccessTokenErrorCode,
  DiscoveryError,
  OAuth2Error,
} from "@auth0/nextjs-auth0/errors";
import { authenticationFailure } from "../lib/auth-errors.js";

test("expired sessions, absent refresh tokens and revoked grants require fresh login", () => {
  for (const code of [
    AccessTokenErrorCode.MISSING_SESSION,
    AccessTokenErrorCode.MISSING_REFRESH_TOKEN,
    AccessTokenErrorCode.SESSION_EXPIRED,
  ])
    assert.equal(
      authenticationFailure(new AccessTokenError(code, "Synthetic failure")),
      "login",
    );
  for (const code of [
    "invalid_grant",
    "login_required",
    "consent_required",
    "interaction_required",
  ]) {
    const error = new AccessTokenError(
      AccessTokenErrorCode.FAILED_TO_REFRESH_TOKEN,
      "Synthetic failure",
      new OAuth2Error({ code }),
    );
    assert.equal(authenticationFailure(error), "login");
  }
});

test("provider/configuration failures stay retryable and unexpected errors are not disguised as login", () => {
  for (const code of [
    "temporarily_unavailable",
    "server_error",
    "invalid_client",
    "unknown_error",
  ]) {
    assert.equal(
      authenticationFailure(
        new AccessTokenError(
          AccessTokenErrorCode.FAILED_TO_REFRESH_TOKEN,
          "Synthetic failure",
          new OAuth2Error({ code }),
        ),
      ),
      "unavailable",
    );
  }
  assert.equal(
    authenticationFailure(new DiscoveryError("Synthetic failure")),
    "unavailable",
  );
  const unexpected = new TypeError("Unexpected programming failure");
  assert.throws(
    () => authenticationFailure(unexpected),
    (error) => error === unexpected,
  );
});
