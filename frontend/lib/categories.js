export const categoryIcons = [
  { value: "house", label: "Home" },
  { value: "heart-pulse", label: "Health" },
  { value: "shopping-basket", label: "Shopping" },
  { value: "utensils", label: "Food" },
  { value: "train-front", label: "Transport" },
  { value: "shirt", label: "Clothing" },
  { value: "gamepad-2", label: "Leisure" },
  { value: "gift", label: "Gift" },
  { value: "landmark", label: "Bank" },
  { value: "circle-ellipsis", label: "Other" },
  { value: "plane", label: "Travel" },
  { value: "car", label: "Car" },
  { value: "book-open", label: "Book" },
  { value: "coffee", label: "Coffee" },
];

export class CategoryInputError extends Error {}

export const categoryKinds = ["expense", "income"];

export function categoriesForType(categories, type) {
  if (!type) return categories;
  if (type === "balance_adjustment") return [];
  return categories.filter(
    (category) => category.kind === (type === "income" ? "income" : "expense"),
  );
}

export function filterCategories(categories, query) {
  const normalize = (value) =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const search = normalize(query.trim());
  if (!search) return categories;
  return categories.filter(
    (category) =>
      normalize(category.name).includes(search) ||
      category.subcategories.some((child) =>
        normalize(child.name).includes(search),
      ),
  );
}

export function validCategoryFields(data) {
  return (
    data &&
    typeof data.name === "string" &&
    data.name.trim().length > 0 &&
    [...data.name.trim()].length <= 100 &&
    typeof data.colour === "string" &&
    /^#[0-9a-f]{6}$/i.test(data.colour) &&
    categoryIcons.some((icon) => icon.value === data.icon)
  );
}

export function categoryPayload(form) {
  const data = Object.fromEntries(
    ["name", "colour", "icon"].map((key) => [key, form.get(key)]),
  );
  if (!validCategoryFields(data)) {
    throw new CategoryInputError(
      "Enter a name of 1 to 100 characters, a hex colour, and a supported icon.",
    );
  }
  if (!form.get("parent_id")) {
    data.kind = form.get("kind") ?? "expense";
    if (!categoryKinds.includes(data.kind)) {
      throw new CategoryInputError("Choose expense or income categories.");
    }
  }
  return { ...data, name: data.name.trim() };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function categoryPath({ id = null, parent_id = null } = {}) {
  for (const value of [id, parent_id]) {
    if (value !== null && (typeof value !== "string" || !uuid.test(value))) {
      throw new CategoryInputError("Choose a valid category.");
    }
  }
  const base = parent_id
    ? `/api/v1/categories/${parent_id}/subcategories`
    : "/api/v1/categories";
  return id ? `${base}/${id}` : base;
}

export function categoryTarget(form) {
  const target = { id: form.get("id"), parent_id: form.get("parent_id") };
  categoryPath(target);
  return target;
}
