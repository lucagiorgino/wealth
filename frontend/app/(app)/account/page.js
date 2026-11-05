import { connection } from "next/server";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { AccountForm } from "@/components/account-form";
import { AccountPictureForm } from "@/components/account-picture-form";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccount } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Account" };

export default async function Account() {
  await connection();
  await requireSession();

  let account;
  let failure;
  try {
    account = await getAccount();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    console.error("Account request failed", { status: error.status });
    failure = error.message;
  }

  return (
    <>
      <PageHeading
        eyebrow="Personal settings"
        title="Your account"
        description="A familiar name. A picture that's yours. Make this space feel like you."
      />
      {failure ? (
        <Feedback state={{ error: failure }} />
      ) : (
        <>
          <Card>
            <CardHeader className="space-y-1 border-b">
              <CardTitle>
                <h2 className="text-lg font-semibold">Profile</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                These preferences are only used in Wealth.
              </p>
            </CardHeader>
            <CardContent className="grid gap-8 lg:grid-cols-2 lg:gap-10">
              <div className="space-y-5">
                <div className="space-y-1">
                  <h3 className="font-semibold">Personal details</h3>
                  <p className="text-sm text-muted-foreground">
                    How you appear in your workspace.
                  </p>
                </div>
                <AccountForm account={account} />
              </div>
              <AccountPictureForm account={account} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LockKeyhole
                  aria-hidden="true"
                  className="size-4 text-primary-ink"
                />
                <h2>Sign-in and security</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Auth0 manages your sign-in, email, and credentials. Saving your
                Wealth profile does not change your identity-provider account.
              </p>
              <details className="rounded-lg border bg-muted/30 p-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                  View verified account ID
                </summary>
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Fingerprint aria-hidden="true" className="size-4 shrink-0" />
                  <span className="[overflow-wrap:anywhere]">
                    Verified account ID: {account.subject}
                  </span>
                </p>
              </details>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
