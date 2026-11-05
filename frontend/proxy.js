import { NextResponse } from "next/server";
import { getAuth0 } from "@/lib/auth0";
import { missingAuthSettings } from "@/lib/config";
import { authenticationFailure } from "@/lib/auth-errors";

export async function proxy(request) {
  if (missingAuthSettings().length) {
    if (
      request.nextUrl.pathname.startsWith("/auth/") ||
      request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/wallets") ||
      request.nextUrl.pathname.startsWith("/transactions") ||
      request.nextUrl.pathname.startsWith("/summary") ||
      request.nextUrl.pathname.startsWith("/compare-spending") ||
      request.nextUrl.pathname.startsWith("/account") ||
      request.nextUrl.pathname.startsWith("/categories")
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  const auth0 = getAuth0();
  const response = await auth0.middleware(request);
  if (
    !request.nextUrl.pathname.startsWith("/auth/") &&
    (await auth0.getSession(request))
  ) {
    try {
      await auth0.getAccessToken(request, response);
    } catch (error) {
      const failure = authenticationFailure(error);
      console.error("Auth0 token renewal failed", { code: error.code });
      if (failure === "login") {
        const login = new URL("/auth/login", request.url);
        login.searchParams.set("returnTo", request.nextUrl.pathname);
        return NextResponse.redirect(login, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      return new NextResponse(
        "Authentication is temporarily unavailable. Refresh this page to retry.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "private, no-store",
            "Retry-After": "5",
          },
        },
      );
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
