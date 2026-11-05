import { connection } from "next/server";
import { AccountMenu } from "@/components/account-menu";
import { AppSidebar } from "@/components/app-sidebar";
import { getAccount, getSettings } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }) {
  await connection();
  const session = await requireSession();
  let account;
  let failure;
  try {
    account = await getAccount();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    console.error("Sidebar profile request failed", { status: error.status });
    failure = error.message;
  }
  const email =
    typeof session.user.email === "string" ? session.user.email : null;
  let settings;
  let settingsFailure;
  try {
    settings = await getSettings();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    settingsFailure = error.message;
  }
  return (
    <div className="min-h-dvh md:flex md:items-start">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:p-4 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <AppSidebar
        sidebarOrder={settings?.sidebar_order}
        settingsFailure={settingsFailure}
        accountMenu={
          <AccountMenu account={account} email={email} failure={failure} />
        }
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full min-w-0 max-w-6xl space-y-8 px-4 py-7 outline-none sm:px-6 sm:py-8 lg:space-y-10 lg:px-10 lg:py-10"
      >
        {children}
      </main>
    </div>
  );
}
