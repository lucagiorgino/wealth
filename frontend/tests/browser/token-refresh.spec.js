import { expect, test } from "@playwright/test";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import {
  refreshTestToken,
  walletTestOrigin,
  walletTestSecret,
  walletTestToken,
} from "../browser-config.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

const sdk = new Auth0Client({
  domain: "tenant.example.test",
  clientId: "wallet-browser-test",
  clientSecret: "not-a-real-client-secret",
  secret: walletTestSecret,
  appBaseUrl: walletTestOrigin,
  enableAccessTokenEndpoint: false,
});

for (const [kind, expiresIn] of [
  ["expired", -60],
  ["buffer", 30],
]) {
  test(`${kind} access tokens refresh before SSR and rotated tokens persist in HttpOnly cookies`, async ({
    context,
    page,
    request,
  }) => {
    await signInTestUser(context, "old-browser-test-token", {
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      refreshToken: `refresh-${kind}`,
    });
    await page.goto("/summary");
    await expect(
      page.getByRole("heading", { name: "Summary", exact: true }),
    ).toBeVisible();
    const cookies = await context.cookies(walletTestOrigin);
    expect(
      cookies
        .filter((cookie) => cookie.name.startsWith("__session"))
        .every((cookie) => cookie.httpOnly),
    ).toBe(true);
    const session = await sdk.getSession(
      new Request(walletTestOrigin, {
        headers: {
          Cookie: cookies
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; "),
        },
      }),
    );
    expect(session.tokenSet.accessToken).toBe(refreshTestToken);
    expect(session.tokenSet.refreshToken).toBe(`rotated-${kind}-1`);
    expect(await page.content()).not.toContain(refreshTestToken);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "__session",
    );
    await page.goto("/wallets");
    await expect(
      page.getByRole("heading", { name: "Wallets", exact: true }),
    ).toBeVisible();
    const status = () =>
      request
        .get(`http://127.0.0.1:3102/_test/auth0/status?case=${kind}`, {
          headers: { Authorization: `Bearer ${walletTestToken}` },
        })
        .then((response) => response.json());
    expect((await status()).attempts).toBe(1);
    await page.goto("about:blank");
    await signInTestUser(context, refreshTestToken, {
      ...session.tokenSet,
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });
    const renewed = await context.request.get(`${walletTestOrigin}/summary`, {
      maxRedirects: 0,
    });
    expect(renewed.status()).toBe(200);
    expect(await renewed.text()).toContain("Summary");
    expect((await status()).attempts).toBe(2);
    const disabled = await context.request.get(
      `${walletTestOrigin}/auth/access-token`,
      { maxRedirects: 0 },
    );
    expect(disabled.status()).toBe(404);
    expect(await disabled.text()).not.toContain(refreshTestToken);
  });
}

for (const refreshToken of [undefined, "refresh-invalid"]) {
  test(`${refreshToken ? "revoked" : "missing"} refresh tokens require login instead of a rendering failure`, async ({
    context,
  }) => {
    await signInTestUser(context, "expired-browser-test-token", {
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      ...(refreshToken ? { refreshToken } : {}),
    });
    const response = await context.request.get(`${walletTestOrigin}/summary`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    const login = new URL(response.headers().location, walletTestOrigin);
    expect(login.pathname).toBe("/auth/login");
    expect(login.searchParams.get("returnTo")).toBe("/summary");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain(
      "Synthetic rejected grant detail",
    );
  });
}

test("temporary provider failures are explicit retryable failures, not login loops or empty data", async ({
  context,
}) => {
  await signInTestUser(context, "expired-browser-test-token", {
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    refreshToken: "refresh-unavailable",
  });
  const response = await context.request.get(`${walletTestOrigin}/summary`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["retry-after"]).toBe("5");
  expect(await response.text()).toContain("Refresh this page to retry");
  expect(await response.text()).not.toContain(
    "Synthetic provider outage detail",
  );
});
