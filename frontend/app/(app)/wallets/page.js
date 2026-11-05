import Link from "next/link";
import { connection } from "next/server";
import { Info } from "lucide-react";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { CreateWalletDialog } from "@/components/wallet-form";
import { WalletList } from "@/components/wallet-list";
import { getWallets } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { WalletInputError, walletPage } from "@/lib/wallets";

export const metadata = { title: "Wallets" };

export default async function Wallets({ searchParams }) {
  await connection();
  await requireSession();

  let result;
  let failure;
  try {
    const page = walletPage((await searchParams).page);
    result = await getWallets(page);
  } catch (error) {
    if (
      !(error instanceof BackendError) &&
      !(error instanceof WalletInputError)
    ) {
      throw error;
    }
    console.error("Wallet listing failed", {
      reason: error.name,
      status: error.status,
    });
    failure = error.message;
  }
  const pages = result
    ? Math.max(1, Math.ceil(result.total / result.page_size))
    : 1;

  return (
    <>
      <PageHeading
        eyebrow="Your money"
        title="Wallets"
        description="A place for each account, cash wallet, and savings pot."
        actions={!failure && <CreateWalletDialog />}
      />
      {failure ? (
        <div className="space-y-4">
          <Feedback state={{ error: failure }} />
          <Button asChild variant="outline">
            <Link href="/wallets">Back to first page</Link>
          </Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="wallets-heading" className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2
                id="wallets-heading"
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Your wallets
              </h2>
              <p className="text-sm text-muted-foreground">
                {result.total} {result.total === 1 ? "wallet" : "wallets"}
              </p>
            </div>
            {result.page > pages ? (
              <div className="space-y-4">
                <Feedback
                  state={{ error: "This wallet page does not exist." }}
                />
                <Button asChild variant="outline">
                  <Link href={`/wallets?page=${pages}`}>Back to last page</Link>
                </Button>
              </div>
            ) : (
              <>
                <WalletList wallets={result.wallets} page={result.page} />
                <nav
                  aria-label="Wallet pagination"
                  className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
                >
                  <Button
                    asChild={result.page > 1}
                    disabled={result.page === 1}
                    variant="outline"
                  >
                    {result.page > 1 ? (
                      <Link href={`/wallets?page=${result.page - 1}`}>
                        Previous
                      </Link>
                    ) : (
                      "Previous"
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Page {result.page} of {pages} - {result.total} wallets
                  </p>
                  <Button
                    asChild={result.page < pages}
                    disabled={result.page === pages}
                    variant="outline"
                  >
                    {result.page < pages ? (
                      <Link href={`/wallets?page=${result.page + 1}`}>
                        Next
                      </Link>
                    ) : (
                      "Next"
                    )}
                  </Button>
                </nav>
              </>
            )}
          </section>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info aria-hidden="true" className="size-4 shrink-0" />
            Current amount is the starting amount plus income, minus expenses,
            plus incoming transfers and minus outgoing transfers due through
            today UTC. Wallets are listed oldest first, so a new wallet may
            appear on a later page.
          </p>
        </>
      )}
    </>
  );
}
