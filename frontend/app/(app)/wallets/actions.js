"use server";

import { revalidatePath } from "next/cache";
import {
  createWallet,
  updateWallet,
  deleteWallet,
  previewWalletIcon,
} from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { WalletInputError, walletId, walletPayload } from "@/lib/wallets";

export async function createWalletAction(previousState, formData) {
  await requireSession();
  try {
    await createWallet(walletPayload(formData));
  } catch (error) {
    if (error instanceof WalletInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Wallet creation failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/wallets");
  revalidatePath("/transactions");
  revalidatePath("/assets");
  return { success: "Wallet created." };
}

export async function previewWalletIconAction(url) {
  await requireSession();
  try {
    return { icon_image_url: await previewWalletIcon(url) };
  } catch (error) {
    if (error instanceof WalletInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Wallet icon preview failed", { status: error.status });
    return { error: error.message };
  }
}

export async function updateWalletAction(previousState, formData) {
  await requireSession();
  try {
    await updateWallet(walletId(formData.get("id")), walletPayload(formData));
  } catch (error) {
    if (error instanceof WalletInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Wallet update failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/wallets");
  revalidatePath("/transactions");
  revalidatePath("/assets");
  return { success: "Wallet updated." };
}

export async function deleteWalletAction(previousState, formData) {
  await requireSession();
  try {
    await deleteWallet(walletId(formData.get("id")));
  } catch (error) {
    if (error instanceof WalletInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Wallet deletion failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/wallets");
  revalidatePath("/transactions");
  revalidatePath("/assets");
  return { success: "Wallet deleted." };
}
