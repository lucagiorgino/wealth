const authSettings = [
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "APP_BASE_URL",
];

export function missingAuthSettings(env = process.env) {
  return authSettings.filter((name) => !env[name]?.trim());
}

export function backendOrigin(env = process.env) {
  if (!env.BACKEND_API_URL) {
    throw new Error("BACKEND_API_URL must be configured");
  }
  const url = new URL(env.BACKEND_API_URL);
  const localHttp =
    env.APP_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]", "backend"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && localHttp)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "BACKEND_API_URL must be an HTTPS origin (local HTTP only in explicit development)",
    );
  }
  return url.origin;
}
