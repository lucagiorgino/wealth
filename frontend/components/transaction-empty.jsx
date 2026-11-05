import { Coins, PiggyBank, Sparkles } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { transactionMonthLabel } from "@/lib/transactions";

export function TransactionEmpty({ month, filtered }) {
  return (
    <Empty className="min-h-80 border bg-card px-4 py-8 sm:min-h-96 sm:p-8">
      <EmptyHeader>
        <EmptyMedia>
          <div
            aria-hidden="true"
            className="relative mb-4 flex h-36 w-52 items-center justify-center sm:h-48 sm:w-64"
          >
            <div className="absolute inset-2 rounded-[45%_55%_40%_60%] bg-accent" />
            <div className="absolute inset-7 rotate-12 rounded-full border border-primary/20" />
            <PiggyBank
              className="relative size-20 -rotate-6 text-primary-ink/80 sm:size-28"
              strokeWidth={1.2}
            />
            <Coins
              className="absolute right-4 bottom-3 size-10 text-primary-ink sm:size-14"
              strokeWidth={1.4}
            />
            <Sparkles
              className="absolute top-3 right-8 size-6 text-primary-ink/70 sm:size-8"
              strokeWidth={1.3}
            />
            <span className="absolute top-10 left-8 size-3 rounded-full bg-primary/30" />
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {filtered
            ? "No transactions match your filters"
            : month === "all"
              ? "No transactions yet"
              : `No transactions for ${transactionMonthLabel(month)}`}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Try another search, change the filters, or choose a different month."
            : "Use Add transaction to record income, an expense, or a transfer."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
