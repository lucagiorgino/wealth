import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeftRight,
  Lightbulb,
  Tags,
  Wallet,
} from "lucide-react";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountAvatar } from "@/components/account-avatar";
import { getAccount } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  await connection();
  await requireSession();

  let profile;
  let failure;
  try {
    profile = await getAccount();
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    console.error("Dashboard request failed", { status: error.status });
    failure = error.message;
  }

  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Your dashboard"
        description="A clear starting point for your everyday money."
      />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="justify-center bg-accent/60 py-8 shadow-none sm:py-10">
          <CardContent className="space-y-5">
            <span className="flex size-12 items-center justify-center rounded-lg bg-card text-primary-ink">
              <ArrowLeftRight aria-hidden="true" className="size-6" />
            </span>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Small details. A clearer picture.
              </h2>
              <p className="max-w-md leading-relaxed text-muted-foreground">
                Keep your income, expenses, and transfers together. Pick up
                where you left off or record something new.
              </p>
            </div>
            <Button asChild className="gap-3 px-4">
              <Link href="/transactions">
                Manage transactions <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="justify-center">
          <CardHeader>
            <CardTitle>Your space</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {failure ? (
              <Feedback state={{ error: failure }} />
            ) : (
              <div className="flex items-center gap-4">
                <AccountAvatar
                  icon={profile.icon}
                  avatarUrl={profile.avatar_url}
                  className="size-14 shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-lg font-semibold [overflow-wrap:anywhere]">
                    {profile.display_name ?? "Your account"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Make Wealth feel like you.
                  </p>
                </div>
              </div>
            )}
            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href="/account">
                Manage account <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="workspace-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="workspace-heading" className="text-lg font-semibold">
            Build your everyday routine
          </h2>
          <p className="text-sm text-muted-foreground">
            Start with your wallets, then organize the details.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              href: "/wallets",
              icon: Wallet,
              step: "01",
              title: "Set up your wallets",
              description: "Give each account or cash wallet a home.",
              link: "Manage wallets",
            },
            {
              href: "/categories",
              icon: Tags,
              step: "02",
              title: "Find your categories",
              description: "Create your own structure or choose a preset.",
              link: "Manage categories",
            },
            {
              href: "/transactions",
              icon: ArrowLeftRight,
              step: "03",
              title: "Keep a record",
              description: "Add a single transaction or a recurring series.",
              link: "View transactions",
            },
          ].map(({ href, icon: Icon, step, title, description, link }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-5 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <div className="flex items-center justify-between">
                <Icon aria-hidden="true" className="size-5 text-primary-ink" />
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {step}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
              <span className="flex items-center justify-between text-sm font-medium text-primary-ink">
                {link} <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Wallets show their current transaction-derived balances. Asset
          tracking and balance summaries remain planned.
        </p>
      </div>
    </>
  );
}
