import { expect, test } from "@playwright/test";
import { walletTestOrigin, walletTestToken } from "../browser-config.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

const apiOrigin = "http://127.0.0.1:3102";
const apiHeaders = { Authorization: `Bearer ${walletTestToken}` };

function categoryCard(page, name) {
  return page
    .getByRole("region", { name: "Your categories", exact: true })
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function categoryAction(page, name, action, subcategory = false) {
  const level = subcategory ? "subcategory" : "category";
  await page
    .getByRole("button", {
      name: `Actions for ${level} ${name}`,
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

test("users select private preset copies and create, edit, and delete two-level categories", async ({
  context,
  page,
  request,
}) => {
  await signInTestUser(context);
  await page.goto("/dashboard");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation
    .getByRole("link", { name: "Categories", exact: true })
    .click();
  await expect(page).toHaveURL("/categories");
  await expect(
    navigation.getByRole("link", { name: "Categories", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const owned = page.getByRole("region", {
    name: "Your categories",
    exact: true,
  });
  await expect(owned).toContainText("No expense categories yet");
  await expect(owned).toContainText("No income categories yet");
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  const create = page.getByRole("form", {
    name: "Create category",
    exact: true,
  });
  await create.getByLabel("Name", { exact: true }).fill("Custom");
  await create.getByRole("radio", { name: "Book", exact: true }).click();
  await expect(
    create.getByRole("radio", { name: "Book", exact: true }),
  ).toBeChecked();
  await create.getByLabel("Colour", { exact: true }).fill("#16a34a");
  await create
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(create).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create category", exact: true }),
  ).toBeFocused();
  await expect(
    owned.getByRole("heading", { name: "Custom", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await create.getByLabel("Name", { exact: true }).fill("  custom  ");
  await create
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(create.getByRole("alert")).toContainText("Choose a unique name");
  await expect(create.getByLabel("Name", { exact: true })).toHaveValue(
    "  custom  ",
  );
  await page.keyboard.press("Escape");
  await expect(
    owned.getByRole("heading", { name: "Custom", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Browse expense presets", exact: true })
    .click();
  const presets = page.getByRole("form", {
    name: "Predefined categories",
    exact: true,
  });
  await expect(
    presets.getByRole("button", { name: "Add selected categories" }),
  ).toBeDisabled();
  await presets.getByRole("checkbox", { name: "Casa", exact: true }).check();
  await expect(presets.getByRole("status")).toHaveText("1 group selected");
  const importRefusal = await request.post(
    `${apiOrigin}/_test/category-save-failure`,
    { headers: apiHeaders },
  );
  expect(importRefusal.status()).toBe(200);
  await presets
    .getByRole("button", { name: "Add selected categories" })
    .click();
  await expect(presets.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(
    presets.getByRole("checkbox", { name: "Casa", exact: true }),
  ).toBeChecked();
  await presets
    .getByRole("button", { name: "Add selected categories" })
    .click();
  await expect(presets).not.toBeVisible();
  await expect(
    owned.getByRole("heading", { name: "Casa", exact: true }),
  ).toBeVisible();
  await expect(
    owned.getByRole("heading", { name: "Leisure", exact: true }),
  ).toHaveCount(0);
  const home = categoryCard(page, "Casa");
  await home.getByRole("button", { name: "View subcategories" }).click();
  const children = owned.getByRole("region", {
    name: "Subcategories of Casa",
    exact: true,
  });
  await expect(children.getByRole("listitem")).toHaveCount(6);
  await expect(
    children.getByText("Elettricit\u00e0", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse expense presets", exact: true })
    .click();
  await expect(
    presets.getByRole("checkbox", { name: "Casa", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await categoryAction(page, "Custom", "Edit category");
  const edit = page.getByRole("form", {
    name: "Edit category Custom",
    exact: true,
  });
  await edit.getByLabel("Name", { exact: true }).fill("casa");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toContainText("Choose a unique name");
  await expect(edit.getByLabel("Name", { exact: true })).toHaveValue("casa");
  await edit.getByLabel("Name", { exact: true }).fill("My category");
  await edit.getByRole("radio", { name: "Coffee", exact: true }).click();
  const refusal = await request.post(
    "http://127.0.0.1:3102/_test/category-save-failure",
    {
      headers: { Authorization: `Bearer ${walletTestToken}` },
    },
  );
  expect(refusal.status()).toBe(200);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(edit.getByLabel("Name", { exact: true })).toHaveValue(
    "My category",
  );
  await expect(
    edit.getByRole("radio", { name: "Coffee", exact: true }),
  ).toBeChecked();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(
    owned.getByRole("heading", { name: "My category", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Actions for category My category",
      exact: true,
    }),
  ).toBeFocused();
  const custom = categoryCard(page, "My category");
  await custom.getByRole("button", { name: "Add subcategory" }).click();
  const addChild = page.getByRole("form", {
    name: "Add subcategory to My category",
    exact: true,
  });
  await addChild.getByLabel("Name", { exact: true }).fill("Child");
  await expect(
    addChild.getByRole("radio", { name: "Coffee", exact: true }),
  ).toBeChecked();
  await addChild.getByRole("button", { name: "Add subcategory" }).click();
  const customChildren = owned.getByRole("region", {
    name: "Subcategories of My category",
    exact: true,
  });
  await expect(customChildren.getByRole("listitem")).toHaveCount(1);
  await custom.getByRole("button", { name: "Add subcategory" }).click();
  await addChild.getByLabel("Name", { exact: true }).fill("CHILD");
  await addChild.getByRole("button", { name: "Add subcategory" }).click();
  await expect(addChild.getByRole("alert")).toContainText(
    "Choose a unique name",
  );
  await expect(addChild.getByLabel("Name", { exact: true })).toHaveValue(
    "CHILD",
  );
  await page.keyboard.press("Escape");
  await expect(customChildren.getByRole("listitem")).toHaveCount(1);
  await categoryAction(page, "Child", "Edit subcategory", true);
  const editChild = page.getByRole("form", {
    name: "Edit subcategory Child",
    exact: true,
  });
  await editChild.getByLabel("Name", { exact: true }).fill("Edited child");
  await editChild.getByLabel("Colour", { exact: true }).fill("#ff0000");
  await editChild.getByRole("button", { name: "Save changes" }).click();
  await expect(
    customChildren.getByText("Edited child", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await custom.getByRole("button", { name: "View subcategories" }).click();
  const savedChildren = owned.getByRole("region", {
    name: "Subcategories of My category",
    exact: true,
  });
  await expect(
    savedChildren.getByText("Edited child", { exact: true }),
  ).toBeVisible();
  await expect(savedChildren.locator("li svg.lucide-coffee").first()).toHaveCSS(
    "color",
    "rgb(255, 0, 0)",
  );
  await expect(
    custom.getByRole("button", { name: "Add subcategory" }),
  ).toHaveCount(1);
  await categoryAction(page, "Edited child", "Delete subcategory", true);
  const confirmChild = page.getByRole("alertdialog", {
    name: "Delete Edited child?",
    exact: true,
  });
  await expect(
    confirmChild.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await confirmChild.getByRole("button", { name: "Cancel" }).click();
  await expect(savedChildren.getByRole("listitem")).toHaveCount(1);
  await categoryAction(page, "Edited child", "Delete subcategory", true);
  await confirmChild
    .getByRole("button", { name: "Delete subcategory" })
    .click();
  await expect(savedChildren.getByRole("listitem")).toHaveCount(0);

  const listing = await request.get(`${apiOrigin}/api/v1/categories`, {
    headers: apiHeaders,
  });
  expect(listing.status()).toBe(200);
  const { categories } = await listing.json();
  const refuseDelete = await request.post(
    `${apiOrigin}/_test/category-delete-failure`,
    {
      headers: apiHeaders,
      data: {
        id: categories.find((category) => category.name === "My category").id,
      },
    },
  );
  expect(refuseDelete.status()).toBe(200);
  await categoryAction(page, "My category", "Delete category");
  const refused = page.getByRole("alertdialog", {
    name: "Delete My category?",
    exact: true,
  });
  await refused.getByRole("button", { name: "Delete category" }).click();
  await expect(refused.getByRole("alert")).toContainText(
    "used by transactions",
  );
  await refused.getByRole("button", { name: "Cancel" }).click();
  await expect(
    owned.getByRole("heading", { name: "My category", exact: true }),
  ).toBeVisible();

  await categoryAction(page, "Casa", "Delete category");
  const confirmHome = page.getByRole("alertdialog", {
    name: "Delete Casa?",
    exact: true,
  });
  await expect(confirmHome).toContainText("6 subcategories");
  await confirmHome
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await expect(
    owned.getByRole("heading", { name: "Casa", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Browse expense presets", exact: true })
    .click();
  await expect(
    presets.getByRole("checkbox", { name: "Casa", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await categoryAction(page, "My category", "Delete category");
  await refused.getByRole("button", { name: "Delete category" }).click();
  await expect(owned).toContainText("No expense categories yet");
  await expect(
    page.getByRole("button", { name: "Create expense category", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    navigation.getByRole("link", { name: "Categories", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(await page.content()).not.toContain(walletTestToken);
});

test("category search, keyboard dialogs, and responsive preset selection retain hierarchy", async ({
  context,
  page,
  request,
}, testInfo) => {
  const created = await request.post(`${apiOrigin}/api/v1/categories`, {
    headers: apiHeaders,
    data: { name: "Daily life", colour: "#16a34a", icon: "shopping-basket" },
  });
  expect(created.status()).toBe(201);
  const root = await created.json();
  for (const name of ["Caf\u00e9", "Market"]) {
    const child = await request.post(
      `${apiOrigin}/api/v1/categories/${root.id}/subcategories`,
      {
        headers: apiHeaders,
        data: { name, colour: "#16a34a", icon: "coffee" },
      },
    );
    expect(child.status()).toBe(201);
  }
  const travel = await request.post(`${apiOrigin}/api/v1/categories`, {
    headers: apiHeaders,
    data: { name: "Travel", colour: "#8b5cf6", icon: "plane" },
  });
  expect(travel.status()).toBe(201);
  await signInTestUser(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/categories");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((dark) => {
        document.documentElement.classList.toggle("dark", dark);
      }, theme === "dark");
      for (const name of ["Daily life", "Travel"]) {
        const { gutter, ...insets } = await categoryCard(page, name).evaluate(
          (element) => {
            const header = element.querySelector('[data-slot="card-header"]');
            const content = element.querySelector('[data-slot="card-content"]');
            const bounds = element.getBoundingClientRect();
            const headerBounds = header.getBoundingClientRect();
            const contentBounds = content.getBoundingClientRect();
            const headerStyle = getComputedStyle(header);
            return {
              gutter: parseFloat(headerStyle.paddingLeft),
              top: headerBounds.top - bounds.top,
              bottom: bounds.bottom - contentBounds.bottom,
              divider: parseFloat(headerStyle.paddingBottom),
              content: contentBounds.top - headerBounds.bottom,
            };
          },
        );
        expect(gutter).toBeGreaterThan(0);
        for (const [edge, inset] of Object.entries(insets)) {
          expect(inset, `${name} ${edge}, ${theme}, ${width}px`).toBeCloseTo(
            gutter,
            1,
          );
        }
      }
      await page.screenshot({
        path: testInfo.outputPath(`categories-spacing-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const search = page.getByRole("searchbox", { name: "Search categories" });
  await search.fill(" CAFE ");
  await expect(categoryCard(page, "Daily life")).toBeVisible();
  await expect(categoryCard(page, "Travel")).toHaveCount(0);
  const children = page.getByRole("region", {
    name: "Subcategories of Daily life",
    exact: true,
  });
  await expect(children.getByRole("listitem")).toHaveCount(2);
  await expect(children.getByText("Caf\u00e9", { exact: true })).toBeVisible();
  await search.fill("No matching category");
  await expect(
    page.getByText("No matching expense categories", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear category search", exact: true })
    .click();
  await expect(search).toBeFocused();
  await expect(categoryCard(page, "Travel")).toBeVisible();

  const create = page.getByRole("button", {
    name: "Create category",
    exact: true,
  });
  await create.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("dialog", {
    name: "Create category",
    exact: true,
  });
  await expect(editor.getByLabel("Name", { exact: true })).toBeFocused();
  await editor.getByRole("radio", { name: "Home", exact: true }).focus();
  await page.keyboard.down("ArrowRight");
  await expect(
    editor.getByRole("radio", { name: "Health", exact: true }),
  ).toBeChecked();
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await categoryCard(page, "Daily life")
    .getByRole("button", { name: "View subcategories" })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("categories-desktop.png"),
    fullPage: true,
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: testInfo.outputPath("categories-mobile.png"),
    fullPage: true,
  });
  const browse = page.getByRole("button", {
    name: "Browse expense presets",
    exact: true,
  });
  await browse.click();
  const presets = page.getByRole("dialog", {
    name: "Predefined categories",
    exact: true,
  });
  await presets.getByText("Casa", { exact: true }).click();
  await expect(
    presets.getByRole("checkbox", { name: "Casa", exact: true }),
  ).toBeChecked();
  const add = presets.getByRole("button", { name: "Add selected categories" });
  await expect(add).toBeEnabled();
  await expect(add).toHaveCSS("opacity", "1");
  await expect(add).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("categories-presets-mobile.png"),
  });
  await page.setViewportSize({ width: 375, height: 480 });
  await presets.getByRole("checkbox").last().scrollIntoViewIfNeeded();
  await expect(add).toBeInViewport();
  await expect(
    presets.getByRole("button", { name: "Close", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(browse).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });

  await search.fill("cafe");
  await create.click();
  const longName = "Long".repeat(25);
  await editor.getByLabel("Name", { exact: true }).fill(longName);
  await editor.getByRole("radio", { name: "Coffee", exact: true }).click();
  await editor
    .getByRole("button", { name: "Create category", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    editor.getByRole("button", { name: "Create category", exact: true }),
  ).toBeInViewport();
  await expect(editor).toHaveCSS("animation-name", "none");
  await page.screenshot({
    path: testInfo.outputPath("categories-editor-mobile.png"),
  });
  await editor
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  await expect(search).toHaveValue("");
  await expect(categoryCard(page, longName)).toBeVisible();
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(await page.content()).not.toContain(walletTestToken);
});
