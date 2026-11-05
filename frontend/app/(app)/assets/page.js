import Link from "next/link";
import { connection } from "next/server";
import { AssetDialog } from "@/components/asset-form";
import { AssetSummary } from "@/components/asset-summary";
import { SummaryYear } from "@/components/expense-summary";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getAssetSummary } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { SummaryInputError, summaryView } from "@/lib/summary";

export const metadata = { title: "Assets" };

export default async function Assets({ searchParams }) {
  await connection();
  await requireSession();
  let year, result, failure;
  const today = new Date().toISOString().slice(0, 10);
  try {
    year = summaryView(await searchParams, today);
    result = await getAssetSummary(year);
  } catch (error) {
    if (
      !(error instanceof BackendError) &&
      !(error instanceof SummaryInputError)
    )
      throw error;
    console.error("Asset summary failed", {
      reason: error.name,
      status: error.status,
    });
    failure = error.message;
  }
  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <PageHeading
        eyebrow="Insights"
        title="Assets"
        description="Your patrimony, from cash and investments to liabilities."
        actions={!failure && <AssetDialog today={today} />}
      />
      {year && <SummaryYear year={year} path="/assets" name="Assets" />}
      {failure ? (
        <div className="space-y-4">
          <Feedback state={{ error: failure }} />
          <Button asChild variant="outline">
            <Link href="/assets">Back to current year</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Wallet balances supply cash automatically. Other holdings use your
            dated valuations, carried forward without market-price updates or
            currency conversion.
          </p>
          <AssetSummary summary={result} />
        </>
      )}
    </div>
  );
}
