import Link from "next/link";
import { connection } from "next/server";
import { ExpenseCharts } from "@/components/expense-charts";
import {
  ExpenseSummaryTables,
  SummaryYear,
} from "@/components/expense-summary";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getExpenseAnalysis } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { SummaryInputError, summaryView } from "@/lib/summary";

export const metadata = { title: "Summary" };

export default async function Summary({ searchParams }) {
  await connection();
  await requireSession();
  let year;
  let result;
  let failure;
  try {
    year = summaryView(
      await searchParams,
      new Date().toISOString().slice(0, 10),
    );
    result = await getExpenseAnalysis(year);
  } catch (error) {
    if (
      !(error instanceof BackendError) &&
      !(error instanceof SummaryInputError)
    )
      throw error;
    console.error("Expense summary failed", {
      reason: error.name,
      status: error.status,
    });
    failure = error.message;
  }
  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <PageHeading
        eyebrow="Insights"
        title="Summary"
        description="Compare income and expenses, month by month."
      />
      {year && <SummaryYear year={year} />}
      {failure ? (
        <div className="space-y-4">
          <Feedback state={{ error: failure }} />
          <Button asChild variant="outline">
            <Link href="/summary">Back to current year</Link>
          </Button>
        </div>
      ) : (
        <>
          <ExpenseCharts charts={result.charts} />
          <ExpenseSummaryTables key={year} summary={result.summary} />
          <ExpenseSummaryTables
            key={`income-${year}`}
            summary={result.income_summary}
            kind="income"
          />
        </>
      )}
    </div>
  );
}
