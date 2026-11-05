import "server-only";
import { cache } from "react";
import { getAuth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { authenticationFailure } from "@/lib/auth-errors";
import {
  fetchAccount,
  fetchSettings,
  putSettings,
  fetchProfile,
  fetchWallets,
  postWallet,
  postWalletIconPreview,
  putWallet,
  removeWallet,
  putAccount,
  patchAccountName,
  putAccountIcon,
  putAccountAvatar,
  removeAccountAvatar,
  fetchCategories,
  fetchCategoryPresets,
  saveCategory,
  removeCategory,
  importCategoryPresets,
  fetchTransactions,
  fetchExpenseSummary,
  fetchExpenseAnalysis,
  postExpenseComparison,
  fetchTransactionOptions,
  saveTransaction,
  removeTransaction,
  saveTransactions,
  removeTransactions,
  uploadTransactionCSV,
  validateTransactionImport,
  confirmTransactionImport,
  BackendError,
} from "@/lib/api-client";
import { backendOrigin } from "@/lib/config";

async function apiOptions() {
  const baseUrl = backendOrigin();
  try {
    const { token } = await getAuth0().getAccessToken();
    return { baseUrl, token };
  } catch (error) {
    const failure = authenticationFailure(error);
    console.error("Server-side API token renewal failed", { code: error.code });
    if (failure === "login") redirect("/auth/login");
    throw new BackendError(503);
  }
}

export async function getProfile() {
  return fetchProfile(await apiOptions());
}

export async function getAccount() {
  return fetchAccount(await apiOptions());
}

export const getSettings = cache(async () => fetchSettings(await apiOptions()));

export async function updateSettings(data) {
  return putSettings(await apiOptions(), data);
}

export async function updateAccount(data) {
  return putAccount(await apiOptions(), data);
}

export async function updateAccountName(data) {
  return patchAccountName(await apiOptions(), data);
}

export async function updateAccountIcon(icon) {
  return putAccountIcon(await apiOptions(), icon);
}

export async function updateAccountAvatar(file) {
  return putAccountAvatar(await apiOptions(), file);
}

export async function deleteAccountAvatar() {
  return removeAccountAvatar(await apiOptions());
}

export async function getWallets(page = 1) {
  return fetchWallets(await apiOptions(), page);
}

export async function createWallet(data) {
  return postWallet(await apiOptions(), data);
}

export async function previewWalletIcon(url) {
  return postWalletIconPreview(await apiOptions(), url);
}

export async function updateWallet(id, data) {
  return putWallet(await apiOptions(), id, data);
}

export async function deleteWallet(id) {
  return removeWallet(await apiOptions(), id);
}

export async function getCategories() {
  return fetchCategories(await apiOptions());
}

export async function getCategoryPresets() {
  return fetchCategoryPresets(await apiOptions());
}

export async function writeCategory(target, data) {
  return saveCategory(await apiOptions(), target, data);
}

export async function deleteCategory(target) {
  return removeCategory(await apiOptions(), target);
}

export async function selectCategoryPresets(keys) {
  return importCategoryPresets(await apiOptions(), keys);
}

export async function getTransactions(filters) {
  return fetchTransactions(await apiOptions(), filters);
}

export async function getExpenseSummary(year) {
  return fetchExpenseSummary(await apiOptions(), year);
}

export async function getExpenseAnalysis(year) {
  return fetchExpenseAnalysis(await apiOptions(), year);
}

export async function compareExpenses(data) {
  return postExpenseComparison(await apiOptions(), data);
}

export async function getTransactionOptions() {
  return fetchTransactionOptions(await apiOptions());
}

export async function writeTransaction(id, data) {
  return saveTransaction(await apiOptions(), id, data);
}

export async function deleteTransaction(id) {
  return removeTransaction(await apiOptions(), id);
}

export async function writeTransactions(data) {
  return saveTransactions(await apiOptions(), data);
}

export async function deleteTransactions(ids) {
  return removeTransactions(await apiOptions(), ids);
}

export async function uploadCSV(file, delimiter) {
  return uploadTransactionCSV(await apiOptions(), file, delimiter);
}

export async function previewCSVImport(data) {
  return validateTransactionImport(await apiOptions(), data);
}

export async function approveCSVImport(data) {
  return confirmTransactionImport(await apiOptions(), data);
}
