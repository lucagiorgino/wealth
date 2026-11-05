import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import {
  walletTestOrigin,
  walletTestSecret,
  walletTestToken,
} from "../browser-config.js";

export async function signInTestUser(
  context,
  token = walletTestToken,
  tokenSet = {},
) {
  const cookie = await generateSessionCookie(
    {
      user: {
        sub: "auth0|wallet-browser-test",
        email: "wallet-user@example.test",
      },
      tokenSet: {
        accessToken: token,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        audience: "https://wallet-api.example.test",
        scope: "openid profile email offline_access",
        ...tokenSet,
      },
    },
    { secret: walletTestSecret },
  );
  await context.addCookies([
    {
      name: "__session",
      value: cookie,
      url: walletTestOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
