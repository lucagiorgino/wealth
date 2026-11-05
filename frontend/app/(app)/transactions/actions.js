"use server";

import { revalidatePath } from "next/cache";
import {
  deleteTransaction,
  deleteTransactions,
  writeTransactions,
  writeTransaction,
  uploadCSV,
  previewCSVImport,
  approveCSVImport,
} from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import {
  TransactionInputError,
  transactionId,
  transactionPayload,
  transactionSelection,
  bulkTransactionPayload,
} from "@/lib/transactions";
import {
  CSVImportError,
  csvFile,
  importPayload,
} from "@/lib/transaction-imports";

function failure(error) {
  if (error instanceof CSVImportError)
    return { error: error.message, status: 422 };
  if (error instanceof TransactionInputError) return { error: error.message };
  if (!(error instanceof BackendError)) throw error;
  console.error("Transaction operation failed", { status: error.status });
  return {
    error: error.message,
    ...(error.validation ? { validation: error.validation } : {}),
    status: error.status,
  };
}

export async function saveTransactionAction(previousState, formData) {
  await requireSession();
  try {
    const id = formData.get("id");
    await writeTransaction(
      id === null ? null : transactionId(id),
      transactionPayload(formData),
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/transactions");
  revalidatePath("/summary");
  revalidatePath("/wallets");
  revalidatePath("/assets");
  return { success: "Transaction saved." };
}

export async function deleteTransactionAction(previousState, formData) {
  await requireSession();
  try {
    await deleteTransaction(transactionId(formData.get("id")));
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/transactions");
  revalidatePath("/summary");
  revalidatePath("/wallets");
  revalidatePath("/assets");
  return { success: "Transaction deleted." };
}

export async function bulkUpdateTransactionsAction(previousState, formData) {
  await requireSession();
  try {
    await writeTransactions(bulkTransactionPayload(formData));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/transactions");
  revalidatePath("/summary");
  revalidatePath("/wallets");
  revalidatePath("/assets");
  return { success: "Selected transactions saved." };
}

export async function bulkDeleteTransactionsAction(previousState, formData) {
  await requireSession();
  try {
    await deleteTransactions(transactionSelection(formData.getAll("ids")));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/transactions");
  revalidatePath("/summary");
  revalidatePath("/wallets");
  revalidatePath("/assets");
  return { success: "Selected transactions deleted." };
}
export async function uploadCSVAction(formData) {
  await requireSession();
  try {
    const { file, delimiter } = csvFile(formData);
    return { document: await uploadCSV(file, delimiter) };
  } catch (error) {
    return failure(error);
  }
}

export async function validateCSVAction(data) {
  await requireSession();
  try {
    return { validation: await previewCSVImport(importPayload(data)) };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmCSVAction(data) {
  await requireSession();
  let result;
  try {
    result = await approveCSVImport(importPayload(data));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/transactions");
  revalidatePath("/summary");
  revalidatePath("/wallets");
  revalidatePath("/categories");
  revalidatePath("/assets");
  return result;
}
