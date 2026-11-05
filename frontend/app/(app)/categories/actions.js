"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCategory,
  selectCategoryPresets,
  writeCategory,
} from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import {
  CategoryInputError,
  categoryPayload,
  categoryTarget,
} from "@/lib/categories";
import { requireSession } from "@/lib/session";

function failure(error) {
  if (error instanceof CategoryInputError) return { error: error.message };
  if (!(error instanceof BackendError)) throw error;
  console.error("Category operation failed", { status: error.status });
  return { error: error.message };
}

export async function saveCategoryAction(previousState, formData) {
  await requireSession();
  try {
    await writeCategory(categoryTarget(formData), categoryPayload(formData));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/summary");
  return { success: "Category saved." };
}

export async function deleteCategoryAction(previousState, formData) {
  await requireSession();
  try {
    const target = categoryTarget(formData);
    if (!target.id)
      throw new CategoryInputError("Choose a category to delete.");
    await deleteCategory(target);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/summary");
  return { success: "Category deleted." };
}

export async function importCategoriesAction(previousState, formData) {
  await requireSession();
  let imported;
  try {
    const keys = formData.getAll("keys");
    if (!keys.length || keys.some((key) => typeof key !== "string")) {
      throw new CategoryInputError(
        "Select at least one predefined category group.",
      );
    }
    imported = await selectCategoryPresets(keys);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/categories");
  revalidatePath("/transactions");
  return {
    success: imported
      ? `Added ${imported} category groups.`
      : "Selected categories were already added. Your customizations are unchanged.",
  };
}
