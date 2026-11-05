"use server";

import { revalidatePath } from "next/cache";
import { createAsset, deleteAsset, recordAssetValuation } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { AssetInputError, assetId, assetPayload } from "@/lib/assets";
import { requireSession } from "@/lib/session";

export async function createAssetAction(previousState, formData) {
  await requireSession();
  try {
    await createAsset(assetPayload(formData));
  } catch (error) {
    if (error instanceof AssetInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Asset creation failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/assets");
  return { success: "Asset added." };
}

export async function recordAssetValuationAction(previousState, formData) {
  await requireSession();
  try {
    await recordAssetValuation(
      assetId(formData.get("id")),
      assetPayload(formData, false),
    );
  } catch (error) {
    if (error instanceof AssetInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Asset valuation failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/assets");
  return { success: "Valuation saved." };
}

export async function deleteAssetAction(previousState, formData) {
  await requireSession();
  try {
    await deleteAsset(assetId(formData.get("id")));
  } catch (error) {
    if (error instanceof AssetInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Asset deletion failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/assets");
  return { success: "Asset and its valuations deleted." };
}
