import { connection } from "next/server";
import { ExpenseComparison } from "@/components/expense-comparison";
import { PageHeading } from "@/components/page-heading";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Compare spending" };

export default async function CompareSpending() {
  await connection();
  await requireSession();
  const asOf = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <PageHeading
        eyebrow="Insights"
        title="Compare spending"
        description="Compare expenses across months, years, or yearly averages."
      />
      <ExpenseComparison year={Number(asOf.slice(0, 4))} asOf={asOf} />
    </div>
  );
}
