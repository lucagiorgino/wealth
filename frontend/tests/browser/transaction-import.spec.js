import { expect, test } from "@playwright/test";
import { walletTestOrigin } from "../browser-config.js";
import {
  csvTestToken,
  importCSV,
  enhancedCSVTestToken,
  enhancedCSV,
} from "../transaction-import-fixtures.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

test("CSV imports map columns, flag individual rows, preserve exclusions, discard previews, and confirm safely on mobile", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, csvTestToken);
  const headers = { Authorization: `Bearer ${csvTestToken}` };
  const api = "http://127.0.0.1:3102";
  await request.post(`${api}/api/v1/wallets`, {
    headers,
    data: { name: "CSV wallet", colour: "#123abc", icon: "wallet" },
  });
  await request.post(`${api}/api/v1/categories`, {
    headers,
    data: { name: "CSV category", colour: "#123abc", icon: "house" },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/transactions?month=all");
  const trigger = page.getByRole("button", {
    name: "Import transactions",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Import transactions from CSV",
  });
  async function upload() {
    await trigger.click();
    await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(importCSV),
    });
    await dialog.getByRole("button", { name: "Load CSV", exact: true }).click();
    await expect(
      dialog.getByText("2. Map columns", { exact: true }),
    ).toBeVisible();
  }
  await upload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("csv-mapping-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await dialog
    .getByRole("button", { name: "Validate and review", exact: true })
    .click();
  const row2 = dialog.getByRole("article", { name: "CSV row 2", exact: true });
  await expect(row2.getByRole("alert")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirm import of 3 rows" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("checkbox", { name: "Include row", exact: false }),
  ).toHaveCount(3);
  await dialog.getByRole("button", { name: "Back to mapping" }).click();
  await dialog.getByLabel("Description", { exact: true }).selectOption("0");
  await expect(dialog.getByLabel("Amount *", { exact: true })).toHaveValue("1");
  await dialog.getByRole("button", { name: "Validate and review" }).click();
  const row3 = dialog.getByRole("article", { name: "CSV row 3", exact: true });
  await expect(row3.getByRole("alert")).toContainText("amount");
  await expect(row2.getByRole("alert")).toHaveCount(0);
  await expect(
    row2.getByRole("checkbox", { name: "Include row 2", exact: true }),
  ).toBeChecked();
  await row3.getByRole("link", { name: /^Amount:/ }).click();
  await expect(
    row3.getByRole("checkbox", { name: "Override amount", exact: true }),
  ).toBeFocused();
  await row3
    .getByRole("checkbox", { name: "Override amount", exact: true })
    .check();
  await row3
    .getByLabel("Amount override", { exact: true })
    .fill("2.000000000000000001");
  await dialog
    .getByRole("button", { name: "Validate changes", exact: true })
    .click();
  await expect(row3.getByRole("alert")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Discard import", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const before = await (
    await request.get(`${api}/api/v1/transactions`, { headers })
  ).json();
  expect(before.total).toBe(0);
  await upload();
  await dialog.getByLabel("Description", { exact: true }).selectOption("0");
  await dialog.getByRole("button", { name: "Validate and review" }).click();
  await row3.getByRole("checkbox", { name: "Include row 3" }).uncheck();
  const row4 = dialog.getByRole("article", { name: "CSV row 4", exact: true });
  await row4.getByRole("checkbox", { name: "Include row 4" }).uncheck();
  await dialog.getByRole("button", { name: "Validate changes" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "1 of 3 rows selected. 0 selected rows have errors.",
  );
  await expect(
    dialog.getByRole("button", {
      name: "Confirm import of 1 row",
      exact: true,
    }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 480 });
  await dialog
    .getByText("4. Review and confirm", { exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: testInfo.outputPath("csv-review-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await request.post(`${api}/_test/csv-confirm-validation-failure`, {
    headers,
  });
  await dialog
    .getByRole("button", { name: "Confirm import of 1 row", exact: true })
    .click();
  await expect(row2.getByRole("alert")).toContainText("Recheck this wallet");
  await expect(
    dialog.getByRole("button", { name: "Discard import", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Back to mapping" }).click();
  await dialog.getByRole("button", { name: "Validate and review" }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Confirm import of 1 row",
      exact: true,
    }),
  ).toBeEnabled();
  await request.post(`${api}/_test/csv-confirm-response-failure`, { headers });
  await dialog
    .getByRole("button", { name: "Confirm import of 1 row", exact: true })
    .click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "outcome is unconfirmed" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Discard import", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Retry confirmation" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "1 transaction imported." }),
  ).toContainText("1 transaction imported.");
  await expect(
    page.getByRole("region", { name: "Your transactions" }),
  ).toContainText("12.123456789012345678");
  const listing = await (
    await request.get(`${api}/api/v1/transactions`, { headers })
  ).json();
  expect(listing.total).toBe(1);
  expect(listing.transactions[0].description).toBe("CSV groceries");
});

test("missing CSV records require a recap approval and localized values are normalized before atomic import", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, enhancedCSVTestToken);
  const headers = { Authorization: `Bearer ${enhancedCSVTestToken}` };
  const api = "http://127.0.0.1:3102";
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/transactions?month=all");
  const trigger = page.getByRole("button", {
    name: "Import transactions",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Import transactions from CSV",
  });
  async function upload() {
    await trigger.click();
    await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({
      name: "localized.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(enhancedCSV),
    });
    await dialog.getByRole("button", { name: "Load CSV", exact: true }).click();
    await dialog
      .getByLabel("Decimal separator", { exact: true })
      .selectOption("comma");
    await dialog
      .getByLabel("CSV date order", { exact: true })
      .selectOption("day-first");
    await dialog
      .getByRole("button", { name: "Validate and review", exact: true })
      .click();
    await expect(
      dialog.getByText("3. Approve missing records", { exact: true }),
    ).toBeVisible();
  }
  async function emptyRecords() {
    expect(
      (
        await (
          await request.get(`${api}/api/v1/transactions`, { headers })
        ).json()
      ).total,
    ).toBe(0);
    expect(
      (
        await (
          await request.get(`${api}/api/v1/transactions/options`, { headers })
        ).json()
      ).wallets,
    ).toHaveLength(0);
    expect(
      (
        await (
          await request.get(`${api}/api/v1/categories`, { headers })
        ).json()
      ).categories,
    ).toHaveLength(0);
  }
  await upload();
  const recap = dialog.getByRole("region", {
    name: "Missing records to create",
  });
  await expect(recap.getByRole("article")).toHaveCount(7);
  await expect(recap).toContainText("Category family: income");
  await expect(recap).toContainText("Category family: expense");
  await expect(recap).toContainText("Wallet: New CSV wallet");
  await expect(recap).toContainText("Main category: Casa");
  await expect(recap).toContainText("Matches predefined group: Casa (casa)");
  await expect(recap).toContainText("Only referenced records will be created.");
  await expect(recap).toContainText("Subcategory: New child");
  await expect(recap).toContainText("Under main category: Casa");
  await emptyRecords();
  await page.screenshot({
    path: testInfo.outputPath("csv-missing-recap-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("csv-missing-recap-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await dialog
    .getByRole("button", {
      name: "Approve records and review transactions",
      exact: true,
    })
    .click();
  const row2 = dialog.getByRole("article", { name: "CSV row 2", exact: true });
  const row3 = dialog.getByRole("article", { name: "CSV row 3", exact: true });
  await expect(row2).toContainText("-1234.56");
  await expect(row2).toContainText("2026-01-31");
  await expect(row2).toContainText("Currency marker recognized: €");
  await expect(row3).toContainText("2026-04-03");
  await page.screenshot({
    path: testInfo.outputPath("csv-normalized-review-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("csv-normalized-review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await emptyRecords();
  await dialog
    .getByRole("button", { name: "Discard import", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await emptyRecords();
  await upload();
  await dialog
    .getByRole("button", {
      name: "Approve records and review transactions",
      exact: true,
    })
    .click();
  const invalid = dialog.getByRole("article", {
    name: "CSV row 4",
    exact: true,
  });
  await expect(invalid.getByRole("alert")).toContainText("valid currency");
  await invalid
    .getByRole("checkbox", { name: "Include row 4", exact: true })
    .uncheck();
  await dialog
    .getByRole("button", { name: "Validate changes", exact: true })
    .click();
  await expect(recap.getByRole("article")).toHaveCount(5);
  await expect(recap).not.toContainText("Unused CSV");
  await dialog
    .getByRole("button", {
      name: "Approve records and review transactions",
      exact: true,
    })
    .click();
  const confirm = dialog.getByRole("button", {
    name: "Confirm import of 2 rows",
    exact: true,
  });
  await expect(confirm).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "2 transactions imported." }),
  ).toContainText("2 transactions imported.");
  const listing = await (
    await request.get(`${api}/api/v1/transactions`, { headers })
  ).json();
  expect(listing.total).toBe(2);
  expect(
    listing.transactions.find((item) => item.type === "expense").amount,
  ).toBe("-1234.56");
  await expect(
    page.getByRole("region", { name: "Your transactions" }),
  ).toContainText("+€ 1234.56");
  const wallets = await (
    await request.get(`${api}/api/v1/wallets`, { headers })
  ).json();
  expect(wallets.total).toBe(1);
  expect(wallets.wallets[0].initial_amount).toBe("0");
  const categories = await (
    await request.get(`${api}/api/v1/categories`, { headers })
  ).json();
  expect(categories.categories).toHaveLength(2);
  const expense = categories.categories.find(
    (category) => category.kind === "expense",
  );
  const income = categories.categories.find(
    (category) => category.kind === "income",
  );
  expect(expense.preset_key).toBe("casa");
  expect(expense.colour).toBe("#3b82f6");
  expect(expense.icon).toBe("house");
  expect(expense.subcategories).toHaveLength(1);
  expect(expense.subcategories[0].name).toBe("New child");
  expect(income.name).toBe("Casa");
  expect(income.preset_key).toBe(null);
  expect(income.subcategories[0].name).toBe("New child");
  expect(income.id).not.toBe(expense.id);
});
