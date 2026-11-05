import {
  AccessTokenError,
  AccessTokenErrorCode,
  DiscoveryError,
  MfaRequiredError,
} from "@auth0/nextjs-auth0/errors";

export function authenticationFailure(error) {
  if (error instanceof MfaRequiredError) return "login";
  if (error instanceof DiscoveryError) return "unavailable";
  if (!(error instanceof AccessTokenError)) throw error;
  if (
    [
      AccessTokenErrorCode.MISSING_SESSION,
      AccessTokenErrorCode.MISSING_REFRESH_TOKEN,
      AccessTokenErrorCode.SESSION_EXPIRED,
    ].includes(error.code)
  )
    return "login";
  if (
    error.code === AccessTokenErrorCode.FAILED_TO_REFRESH_TOKEN &&
    [
      "invalid_grant",
      "login_required",
      "consent_required",
      "interaction_required",
      "mfa_required",
    ].includes(error.cause?.code)
  )
    return "login";
  return "unavailable";
}
