"use server";

import { compareExpenses } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { comparisonPayload, SummaryInputError } from "@/lib/summary";

export async function compareExpensesAction(data) {
  await requireSession();
  try {
    return { comparison: await compareExpenses(comparisonPayload(data)) };
  } catch (error) {
    if (error instanceof SummaryInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Expense comparison failed", { status: error.status });
    return { error: error.message };
  }
}
