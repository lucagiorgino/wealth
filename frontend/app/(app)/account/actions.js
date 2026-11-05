"use server";

import { revalidatePath } from "next/cache";
import {
  updateAccountIcon,
  updateAccountName,
  updateAccountAvatar,
} from "@/lib/api";
import {
  AccountInputError,
  accountPayload,
  profilePicturePayload,
} from "@/lib/account";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

function failure(error) {
  if (error instanceof AccountInputError) return { error: error.message };
  if (!(error instanceof BackendError)) throw error;
  console.error("Account update failed", { status: error.status });
  return { error: error.message };
}

function refreshAccount() {
  revalidatePath("/(app)", "layout");
}

export async function updateAccountAction(previousState, formData) {
  await requireSession();
  try {
    await updateAccountName(accountPayload(formData));
  } catch (error) {
    return failure(error);
  }
  refreshAccount();
  return { success: "Account updated." };
}

export async function updateProfilePictureAction(previousState, formData) {
  await requireSession();
  try {
    const picture = profilePicturePayload(formData);
    if (picture.kind === "image") {
      await updateAccountAvatar(picture.file);
    } else {
      await updateAccountIcon(picture.icon);
    }
  } catch (error) {
    return failure(error);
  }
  refreshAccount();
  return { success: "Profile picture updated." };
}
