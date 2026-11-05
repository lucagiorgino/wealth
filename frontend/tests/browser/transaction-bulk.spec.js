import { expect, test } from "@playwright/test";
import {
  bulkTransactionTestToken,
  walletTestOrigin,
} from "../browser-config.js";
import { signInTestUser } from "./session.js";
import { transactionAction } from "./transaction-actions.js";

test.use({ baseURL: walletTestOrigin });

test("compact transaction rows support persistent pins, page-scoped selection and atomic bulk changes/deletion", async ({
  context,
  page,
  request,
}, testInfo) => {
  const api = "http://127.0.0.1:3102";
  const headers = { Authorization: `Bearer ${bulkTransactionTestToken}` };
  const wallet = await (
    await request.post(`${api}/api/v1/wallets`, {
      headers,
      data: { name: "Bulk bank", icon: "landmark", colour: "#123abc" },
    })
  ).json();
  const category = await (
    await request.post(`${api}/api/v1/categories`, {
      headers,
      data: { name: "Bulk expenses", icon: "house", colour: "#123abc" },
    })
  ).json();
  const income = await (
    await request.post(`${api}/api/v1/categories`, {
      headers,
      data: {
        name: "Bulk income",
        kind: "income",
        icon: "landmark",
        colour: "#123abc",
      },
    })
  ).json();
  const base = {
    type: "expense",
    amount: "12.123456789012345678",
    source_wallet_id: wallet.id,
    category_id: category.id,
  };
  const records = [];
  for (let day = 1; day <= 12; day++) {
    const response = await request.post(`${api}/api/v1/transactions`, {
      headers,
      data: {
        ...base,
        description: `Bulk row ${String(day).padStart(2, "0")}`,
        date: `2001-01-${String(day).padStart(2, "0")}`,
        ...(day === 12 ? { type: "income", category_id: income.id } : {}),
      },
    });
    expect(response.status()).toBe(201);
    records.push(await response.json());
  }
  await signInTestUser(context, bulkTransactionTestToken);
  await page.goto("/transactions?month=2001-01&page=2");
  await transactionAction(page, "Bulk row 01", "Pin transaction");
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${api}/api/v1/transactions`, { headers })
          ).json()
        ).transactions[0].id,
    )
    .toBe(records[0].id);
  await page.goto("/transactions?month=2001-01");
  await page.reload();
  const list = page.getByRole("region", {
    name: "Your transactions",
    exact: true,
  });
  const selectionCount = list.getByRole("status", {
    name: "Transaction selection count",
  });
  const pinned = page.getByRole("region", {
    name: "Pinned transactions",
    exact: true,
  });
  await expect(pinned).toContainText("Bulk row 01");
  const row = (id) =>
    list.locator(`tbody tr[data-transaction-id="${id}"]`).first();
  const headersText = await pinned.getByRole("columnheader").allTextContents();
  expect(headersText.map((value) => value.trim())).toEqual([
    "",
    "Wallet",
    "Description and categories",
    "Date",
    "Amount",
    "Actions",
  ]);
  await expect(row(records[0].id).locator(".lucide-landmark")).toHaveCount(1);
  await expect(row(records[0].id)).toContainText("Bulk expenses");
  await expect(row(records[0].id).locator("time")).toHaveText("Jan 1, 2001");
  await expect(row(records[0].id)).toContainText("-€ 12.123456789012345678");
  await expect(row(records[11].id)).toContainText("+€ 12.123456789012345678");
  await row(records[0].id).getByRole("checkbox").check();
  await row(records[11].id).getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Edit selected", exact: true })
    .click();
  const mixedEditor = page.getByRole("form", {
    name: "Edit selected transactions",
    exact: true,
  });
  await mixedEditor
    .getByRole("checkbox", { name: "Change amount", exact: true })
    .check();
  await mixedEditor.getByLabel("Amount", { exact: true }).fill("-1.5");
  await mixedEditor
    .getByRole("button", { name: "Save selected transactions", exact: true })
    .click();
  await expect(mixedEditor.getByRole("alert")).toContainText(
    "No transactions were changed",
  );
  await mixedEditor
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit selected", exact: true }),
  ).toBeFocused();
  await expect(row(records[0].id)).toContainText("-€ 12.123456789012345678");
  await expect(row(records[11].id)).toContainText("+€ 12.123456789012345678");
  await row(records[11].id).getByRole("checkbox").uncheck();
  await row(records[10].id).getByRole("checkbox").check();
  await expect(
    page.getByRole("checkbox", {
      name: "Select all on this page",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "mixed");
  await expect(selectionCount).toContainText("2 series selected");
  await page
    .getByRole("button", { name: "Edit selected", exact: true })
    .click();
  const editor = page.getByRole("form", {
    name: "Edit selected transactions",
    exact: true,
  });
  await expect(editor.getByLabel("Amount", { exact: true })).toBeDisabled();
  await editor
    .getByRole("checkbox", { name: "Change description", exact: true })
    .check();
  await editor.getByLabel("Description", { exact: true }).fill("Bulk saved");
  await request.post(`${api}/_test/transaction-save-failure`, { headers });
  await editor
    .getByRole("button", { name: "Save selected transactions", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(editor.getByLabel("Description", { exact: true })).toHaveValue(
    "Bulk saved",
  );
  await expect(
    editor.getByRole("checkbox", { name: "Change description", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("dialog")).toContainText(
    "Apply checked fields to 2 selected series",
  );
  await editor
    .getByRole("button", { name: "Save selected transactions", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  await expect(page.locator("#transactions-heading")).toBeFocused();
  await expect(selectionCount).toContainText("0 series selected");
  for (const id of [records[0].id, records[10].id])
    await expect(row(id)).toContainText("Bulk saved");
  await expect(pinned).toContainText("Bulk saved");
  const updated = (
    await (
      await request.get(`${api}/api/v1/transactions?page_size=100`, { headers })
    ).json()
  ).transactions;
  for (const original of [records[0], records[10]]) {
    const current = updated.find((item) => item.id === original.id);
    expect(current.amount).toBe(original.amount);
    expect(current.date).toBe(original.date);
    expect(current.category_id).toBe(original.category_id);
  }
  expect(
    await pinned
      .locator("table")
      .evaluate(
        (table) =>
          table.getBoundingClientRect().width <=
          table.parentElement.parentElement.clientWidth,
      ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("transactions-compact-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: testInfo.outputPath("transactions-compact-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 375, height: 812 });
  const actions = row(records[0].id).getByRole("button", {
    name: /^Actions for transaction /,
  });
  await actions.scrollIntoViewIfNeeded();
  await expect(actions).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await actions.click();
  await expect(
    page.getByRole("menuitem", { name: "Unpin transaction", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("transactions-compact-mobile-menu.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const recurring = await request.post(`${api}/api/v1/transactions`, {
    headers,
    data: {
      ...base,
      description: "Bulk series",
      date: "2001-01-11",
      recurrence: "monthly",
      recurrence_count: 2,
    },
  });
  expect(recurring.status()).toBe(201);
  const series = await recurring.json();
  await page.goto("/transactions?month=all");
  const repeats = list.locator(`tbody tr[data-transaction-id="${series.id}"]`);
  await expect(repeats).toHaveCount(2);
  await repeats.first().getByRole("checkbox").check();
  await expect(repeats.last().getByRole("checkbox")).toBeChecked();
  await expect(selectionCount).toContainText("1 series selected");
  await page.getByRole("button", { name: "Pin selected", exact: true }).click();
  await expect(
    pinned.locator(`tr[data-transaction-id="${series.id}"]`),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Unpin selected", exact: true })
    .click();
  await expect(
    pinned.locator(`tr[data-transaction-id="${series.id}"]`),
  ).toHaveCount(0);
  await page.goto("/transactions?month=2001-01");
  await row(records[0].id).getByRole("checkbox").check();
  await page
    .getByRole("navigation", { name: "Transaction pagination" })
    .getByRole("link", { name: "Next", exact: true })
    .click();
  await expect(selectionCount).toContainText("0 series selected");
  await page
    .getByRole("navigation", { name: "Transaction pagination" })
    .getByRole("link", { name: "Previous", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Select all on this page", exact: true })
    .check();
  await expect(selectionCount).toContainText("10 series selected");
  const selectedIds = await list
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => row.dataset.transactionId));
  const before = (
    await (
      await request.get(`${api}/api/v1/transactions?page_size=100`, { headers })
    ).json()
  ).transactions;
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete selected transactions?",
    exact: true,
  });
  await expect(confirmation).toContainText("every past and future occurrence");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(selectionCount).toContainText("10 series selected");
  await expect(
    page.getByRole("button", { name: "Delete selected", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await request.post(`${api}/_test/transaction-save-failure`, { headers });
  const remove = confirmation.getByRole("button", {
    name: "Delete selected transactions",
    exact: true,
  });
  await remove.click();
  await expect(confirmation.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await remove.click();
  await expect(confirmation).not.toBeVisible();
  const remaining = (
    await (
      await request.get(`${api}/api/v1/transactions?page_size=100`, { headers })
    ).json()
  ).transactions;
  expect(remaining.map((item) => item.id)).toEqual(
    before
      .filter((item) => !selectedIds.includes(item.id))
      .map((item) => item.id),
  );
  expect(remaining.some((item) => item.description === "Bulk series")).toBe(
    false,
  );
  await expect(page.locator("#transactions-heading")).toBeFocused();
});
