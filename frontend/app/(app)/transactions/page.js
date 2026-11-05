import Link from "next/link";
import { connection } from "next/server";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { TransactionEmpty } from "@/components/transaction-empty";
import { TransactionList } from "@/components/transaction-manager";
import { TransactionSummary } from "@/components/transaction-summary";
import {
  TransactionMonths,
  TransactionToolbar,
} from "@/components/transaction-workspace";
import { Button } from "@/components/ui/button";
import {
  getCategories,
  getTransactionOptions,
  getTransactions,
} from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import {
  TransactionInputError,
  transactionView,
  transactionViewQuery,
  transactionTypes,
  transactionTypeLabel,
} from "@/lib/transactions";

export const metadata = { title: "Transactions" };

export default async function Transactions({ searchParams }) {
  await connection();
  await requireSession();
  let filters;
  let month;
  let result;
  let wallets;
  let categories;
  let failure;
  try {
    ({ filters, month } = transactionView(
      await searchParams,
      new Date().toISOString().slice(0, 10),
    ));
    [result, wallets, categories] = await Promise.all([
      getTransactions(filters),
      getTransactionOptions(),
      getCategories(),
    ]);
    if (
      result.transactions.some(
        (item) =>
          !wallets.some((wallet) => wallet.id === item.source_wallet_id),
      )
    ) {
      throw new BackendError(502);
    }
  } catch (error) {
    if (
      !(error instanceof BackendError) &&
      !(error instanceof TransactionInputError)
    )
      throw error;
    console.error("Transaction listing failed", {
      reason: error.name,
      status: error.status,
    });
    failure = error.message;
  }
  const pages = result
    ? Math.max(1, Math.ceil(result.total / result.page_size))
    : 1;
  const activeFilters = filters
    ? Object.entries(filters).filter(
        ([key, value]) =>
          key !== "page" &&
          (month === "all" || !key.startsWith("date_")) &&
          Boolean(value),
      ).length
    : 0;
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {failure ? (
        <div className="space-y-4">
          <PageHeading
            eyebrow="Activity"
            title="Transactions"
            description="Every income, expense, and transfer, with the details that matter."
          />
          <Feedback state={{ error: failure }} />
          <Button asChild variant="outline">
            <Link href="/transactions">Reset transaction filters</Link>
          </Button>
        </div>
      ) : (
        <>
          <TransactionToolbar
            filters={filters}
            month={month}
            today={result.as_of}
            wallets={wallets}
            categories={categories}
            activeFilters={activeFilters}
          />
          <TransactionMonths
            filters={filters}
            month={month}
            today={result.as_of}
          />
          <TransactionSummary
            key={transactionViewQuery(filters, month, 1)}
            summary={result.summary}
          />
          <section
            aria-labelledby="transactions-heading"
            className="flex flex-1 flex-col gap-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="transactions-heading"
                tabIndex={-1}
                className="w-fit rounded text-lg font-semibold focus:outline-2 focus:outline-offset-4 focus:outline-ring"
              >
                Your transactions
              </h2>
              <nav
                aria-label="Transaction types"
                className="flex flex-wrap gap-1.5"
              >
                {["", ...transactionTypes].map((type) => {
                  const selected = (filters.type ?? "") === type;
                  const next = { ...filters };
                  if (type) next.type = type;
                  else delete next.type;
                  return (
                    <Button
                      key={type}
                      asChild
                      size="sm"
                      variant={selected ? "secondary" : "outline"}
                      className="min-h-11 rounded-full capitalize"
                    >
                      <Link
                        href={`/transactions?${transactionViewQuery(next, month, 1)}`}
                        aria-current={selected ? "page" : undefined}
                        scroll={false}
                      >
                        {type ? transactionTypeLabel(type) : "All"}
                      </Link>
                    </Button>
                  );
                })}
              </nav>
            </div>
            {month === "all" && (
              <p className="text-sm text-muted-foreground">
                {filters.date_from || filters.date_to
                  ? "Custom date range"
                  : "All dates"}
              </p>
            )}
            {result.page > pages ? (
              <div className="space-y-4">
                <Feedback
                  state={{ error: "This transaction page does not exist." }}
                />
                <Button asChild variant="outline">
                  <Link
                    href={`/transactions?${transactionViewQuery(filters, month, pages)}`}
                  >
                    Back to last page
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                {result.transactions.length ? (
                  <TransactionList
                    key={transactionViewQuery(filters, month)}
                    transactions={result.transactions}
                    wallets={wallets}
                    categories={categories}
                    today={result.as_of}
                    showMonths={month === "all"}
                  />
                ) : (
                  <TransactionEmpty
                    month={month}
                    filtered={activeFilters > 0}
                  />
                )}
                {result.total > 0 && (
                  <nav
                    aria-label="Transaction pagination"
                    className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
                  >
                    <Button
                      asChild={result.page > 1}
                      disabled={result.page === 1}
                      variant="outline"
                    >
                      {result.page > 1 ? (
                        <Link
                          href={`/transactions?${transactionViewQuery(filters, month, result.page - 1)}`}
                        >
                          Previous
                        </Link>
                      ) : (
                        "Previous"
                      )}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Page {result.page} of {pages} - {result.total}{" "}
                      transactions
                    </p>
                    <Button
                      asChild={result.page < pages}
                      disabled={result.page === pages}
                      variant="outline"
                    >
                      {result.page < pages ? (
                        <Link
                          href={`/transactions?${transactionViewQuery(filters, month, result.page + 1)}`}
                        >
                          Next
                        </Link>
                      ) : (
                        "Next"
                      )}
                    </Button>
                  </nav>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
