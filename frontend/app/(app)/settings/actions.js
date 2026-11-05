"use server";

import { revalidatePath } from "next/cache";
import { updateSettings } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { SettingsInputError, settingsPayload } from "@/lib/settings";

export async function updateSettingsAction(previousState, formData) {
  await requireSession();
  try {
    await updateSettings(settingsPayload(formData));
  } catch (error) {
    if (error instanceof SettingsInputError) return { error: error.message };
    if (!(error instanceof BackendError)) throw error;
    console.error("Settings update failed", { status: error.status });
    return { error: error.message };
  }
  revalidatePath("/", "layout");
  return { success: "Settings saved." };
}
