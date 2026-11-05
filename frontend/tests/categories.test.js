import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendError,
  fetchCategories,
  fetchCategoryPresets,
  importCategoryPresets,
  removeCategory,
  saveCategory,
} from "../lib/api-client.js";
import {
  CategoryInputError,
  categoryPath,
  categoryPayload,
  categoryTarget,
  filterCategories,
  categoriesForType,
} from "../lib/categories.js";
import { categoryPresets } from "./category-fixtures.js";

const options = {
  baseUrl: "https://api.example.test",
  token: "server-only-token",
};
const id = "00582a98-a07f-4fdd-8458-54b590b29cd6";
const childId = "d04d9638-f758-43ca-bc6d-902f3fa39db2";
const item = { id, name: "Home", colour: "#3b82f6", icon: "house" };

function form() {
  const data = new FormData();
  for (const key of ["name", "colour", "icon"]) data.set(key, item[key]);
  return data;
}

test("category search matches parent or child names without losing tree context", () => {
  const home = {
    ...item,
    subcategories: [
      { ...item, id: childId, name: "Elettricit\u00e0" },
      { ...item, id: "another-child", name: "Rent" },
    ],
  };
  const travel = { ...item, id: "travel", name: "Travel", subcategories: [] };
  const categories = [home, travel];
  assert.deepEqual(filterCategories(categories, "  HOME "), [home]);
  assert.deepEqual(filterCategories(categories, "elettricita"), [home]);
  assert.deepEqual(filterCategories(categories, "rent"), [home]);
  assert.deepEqual(filterCategories(categories, "missing"), []);
  assert.deepEqual(filterCategories(categories, "   "), categories);
  assert.equal(home.subcategories.length, 2);
});

test("category forms validate editable attributes and never send supplied owners or hierarchy fields", () => {
  const data = form();
  data.set("name", "  Home  ");
  data.set("owner_subject", "another-user");
  data.set("subcategories", "forged");
  assert.deepEqual(categoryPayload(data), {
    name: "Home",
    colour: item.colour,
    icon: "house",
    kind: "expense",
  });
  for (const [field, value] of [
    ["name", " "],
    ["name", "x".repeat(101)],
    ["colour", "red"],
    ["icon", "unsupported"],
  ]) {
    const invalid = form();
    invalid.set(field, value);
    assert.throws(() => categoryPayload(invalid), CategoryInputError);
  }
  data.set("parent_id", "../../me");
  assert.throws(() => categoryTarget(data), CategoryInputError);
  assert.equal(
    categoryPath({ parent_id: id, id: childId }),
    `/api/v1/categories/${id}/subcategories/${childId}`,
  );
});

test("category listing and presets refuse malformed or deeper-than-two-level responses", async () => {
  const root = {
    ...item,
    kind: "expense",
    preset_key: null,
    subcategories: [{ ...item, id: childId }],
  };
  assert.deepEqual(
    await fetchCategories({
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, "https://api.example.test/api/v1/categories");
        assert.equal(request.cache, "no-store");
        assert.equal(request.redirect, "error");
        return Response.json({ categories: [root] });
      },
    }),
    [root],
  );
  assert.deepEqual(
    await fetchCategoryPresets({
      ...options,
      fetchImpl: async () => Response.json({ presets: categoryPresets }),
    }),
    categoryPresets,
  );
  for (const data of [
    {},
    { categories: [{ ...root, kind: undefined }] },
    { categories: [{ ...root, kind: "transfer" }] },
    { categories: [{ ...root, icon: "unsupported" }] },
    { categories: [{ ...root, id: "invalid" }] },
    {
      categories: [
        { ...root, subcategories: [{ ...item, subcategories: [item] }] },
      ],
    },
  ]) {
    await assert.rejects(
      fetchCategories({
        ...options,
        fetchImpl: async () => Response.json(data),
      }),
      (error) => error instanceof BackendError && error.status === 502,
    );
  }
});

test("category families isolate transaction choices and child payloads inherit their parent", () => {
  const expense = { ...item, kind: "expense", subcategories: [] };
  const income = { ...item, id: childId, kind: "income", subcategories: [] };
  for (const type of ["expense", "transfer"])
    assert.deepEqual(categoriesForType([expense, income], type), [expense]);
  assert.deepEqual(categoriesForType([expense, income], "income"), [income]);
  const data = form();
  data.set("kind", "income");
  assert.equal(categoryPayload(data).kind, "income");
  data.set("parent_id", id);
  assert.equal("kind" in categoryPayload(data), false);
  data.delete("parent_id");
  data.set("kind", "transfer");
  assert.throws(() => categoryPayload(data), CategoryInputError);
});

test("category writes address the selected level, use explicit failures, and accept 204 deletion", async () => {
  for (const target of [
    {},
    { id },
    { parent_id: id },
    { parent_id: id, id: childId },
  ]) {
    const data = form();
    if (target.parent_id) data.set("parent_id", target.parent_id);
    const payload = categoryPayload(data);
    const result = await saveCategory(
      {
        ...options,
        fetchImpl: async (url, request) => {
          assert.equal(url, `${options.baseUrl}${categoryPath(target)}`);
          assert.equal(request.method, target.id ? "PUT" : "POST");
          assert.deepEqual(JSON.parse(request.body), payload);
          assert.equal("kind" in payload, !target.parent_id);
          assert.equal(
            request.headers.Authorization,
            "Bearer server-only-token",
          );
          return Response.json(item);
        },
      },
      target,
      payload,
    );
    assert.deepEqual(result, item);
  }
  await removeCategory(
    {
      ...options,
      fetchImpl: async (url, request) => {
        assert.equal(
          url,
          `${options.baseUrl}/api/v1/categories/${id}/subcategories/${childId}`,
        );
        assert.equal(request.method, "DELETE");
        return new Response(null, { status: 204 });
      },
    },
    { id: childId, parent_id: id },
  );
  await assert.rejects(
    saveCategory(
      {
        ...options,
        fetchImpl: async () => new Response(null, { status: 404 }),
      },
      { id },
      item,
    ),
    (error) => error instanceof BackendError && error.status === 404,
  );
  assert.equal(
    await importCategoryPresets(
      {
        ...options,
        fetchImpl: async () => Response.json({ imported: 0 }),
      },
      ["casa"],
    ),
    0,
  );
  await assert.rejects(
    importCategoryPresets(
      {
        ...options,
        fetchImpl: async () => new Response(null, { status: 503 }),
      },
      ["casa"],
    ),
    (error) => error instanceof BackendError && error.status === 503,
  );
});

test("duplicate-name refusals are distinct from referenced-category deletion refusals", async () => {
  const refused = {
    ...options,
    fetchImpl: async () => new Response(null, { status: 409 }),
  };
  for (const target of [
    {},
    { id },
    { parent_id: id },
    { parent_id: id, id: childId },
  ]) {
    await assert.rejects(
      saveCategory(refused, target, item),
      (error) =>
        error instanceof BackendError &&
        error.status === 409 &&
        /Choose a unique name/.test(error.message) &&
        !/used by transactions/.test(error.message),
    );
  }
  await assert.rejects(
    removeCategory(refused, { id }),
    (error) =>
      error instanceof BackendError &&
      error.status === 409 &&
      /used by transactions/.test(error.message),
  );
});
