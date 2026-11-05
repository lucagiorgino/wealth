import { connection } from "next/server";
import { IBM_Plex_Sans } from "next/font/google";
import { getSettings } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { getAuth0 } from "@/lib/auth0";
import { missingAuthSettings } from "@/lib/config";
import "./globals.css";

const fontSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

export const metadata = {
  title: { default: "Wealth", template: "%s | Wealth" },
  description:
    "Organize personal wallets, categories, and income, expense, and transfer transactions.",
};

export default async function RootLayout({ children }) {
  await connection();
  let settings;
  let failure;
  if (!missingAuthSettings().length && (await getAuth0().getSession())) {
    try {
      settings = await getSettings();
    } catch (error) {
      if (!(error instanceof BackendError)) throw error;
      console.error("Appearance settings request failed", {
        status: error.status,
      });
      failure = error.message;
    }
  }
  return (
    <html
      lang="en"
      className={`${fontSans.variable} h-full antialiased${settings?.theme === "dark" ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">
        {failure && (
          <p
            role="alert"
            className="border-b bg-background p-3 text-sm text-destructive"
          >
            Saved settings unavailable. Using the default appearance. {failure}
          </p>
        )}
        {children}
      </body>
    </html>
  );
}
