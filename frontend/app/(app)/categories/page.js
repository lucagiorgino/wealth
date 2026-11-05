import { connection } from "next/server";
import { CategoryWorkspace } from "@/components/category-workspace";
import { Feedback } from "@/components/feedback";
import { PageHeading } from "@/components/page-heading";
import { getCategories, getCategoryPresets } from "@/lib/api";
import { BackendError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Categories" };

export default async function Categories({ searchParams }) {
  await connection();
  await requireSession();
  const params = await searchParams;
  let categories;
  let presets;
  let failure;
  try {
    [categories, presets] = await Promise.all([
      getCategories(),
      getCategoryPresets(),
    ]);
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    console.error("Category listing failed", { status: error.status });
    failure = error.message;
  }

  if (failure)
    return (
      <>
        <PageHeading
          eyebrow="Your structure"
          title="Categories"
          description="Organize your transactions with categories and subcategories."
        />
        <Feedback state={{ error: failure }} />
      </>
    );
  return (
    <CategoryWorkspace
      categories={categories}
      initialKind={params?.kind === "income" ? "income" : "expense"}
      presets={presets.filter(
        (preset) =>
          !categories.some(
            (category) =>
              category.preset_key === preset.key ||
              (category.kind === preset.kind &&
                category.name.trim().toLowerCase() ===
                  preset.name.trim().toLowerCase()),
          ),
      )}
    />
  );
}
