import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  ArrowLeftRight,
  Layers3,
  LockKeyhole,
  Tags,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { missingAuthSettings } from "@/lib/config";

export default async function Home() {
  await connection();
  const missing = missingAuthSettings();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between border-b py-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground"
          >
            W
          </span>
          Wealth
        </Link>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          Personal by design
        </span>
      </header>
      <div className="grid flex-1 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section className="space-y-7">
          <p className="text-xs font-semibold tracking-widest text-primary-ink uppercase">
            A little clarity, every day
          </p>
          <h1 className="max-w-xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl">
            Your finances, in one place.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Give your money a little structure. Organize your wallets, record
            everyday transactions, and make categories that feel like you.
          </p>
          {missing.length ? (
            <div
              role="status"
              className="max-w-lg space-y-2 rounded-lg border bg-card p-5"
            >
              <p className="font-medium">Authentication setup required.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Configure {missing.join(", ")} in the frontend environment. See
                the frontend setup guide.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Button asChild className="min-h-12 gap-3 px-6">
                <a href="/auth/login">
                  Sign in <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Your sign-in is managed by Auth0.
              </p>
            </div>
          )}
        </section>
        <section
          aria-label="Inside your workspace"
          className="rounded-lg border bg-accent/50 p-5 sm:p-8"
        >
          <div className="mb-7 flex items-center gap-2 text-xs font-medium text-accent-foreground">
            <Layers3 aria-hidden="true" className="size-4" />A place for every
            part of your day
          </div>
          <div className="space-y-4">
            {[
              {
                icon: Wallet,
                title: "Your wallets",
                description:
                  "Everyday spending. Savings. Everything in between.",
                label: "Start with what you have",
              },
              {
                icon: ArrowLeftRight,
                title: "Your transactions",
                description:
                  "Income, expenses, and transfers, with room for repeats.",
                label: "Keep the details together",
              },
              {
                icon: Tags,
                title: "Your categories",
                description:
                  "Your own categories, with optional presets to get going.",
                label: "Make it your own",
              },
            ].map(({ icon: Icon, title, description, label }) => (
              <Card key={title} className="gap-0">
                <CardContent className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary-ink">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                      {label}
                    </p>
                    <h2 className="font-semibold">{title}</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
      <footer className="border-t py-5 text-xs text-muted-foreground">
        Your own space for everyday money. Asset tracking and calculated
        balances are not yet available.
      </footer>
    </main>
  );
}
