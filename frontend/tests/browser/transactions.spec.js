import { expect, test } from "@playwright/test";
import {
  transactionTestToken,
  adjustmentTestToken,
  walletTestOrigin,
} from "../browser-config.js";
import { signInTestUser } from "./session.js";
import { transactionAction } from "./transaction-actions.js";

test.use({ baseURL: walletTestOrigin });

test("category-free Balance Adjustment changes only the following opening balance and stays P&L neutral", async ({
  context,
  page,
  request,
}) => {
  await signInTestUser(context, adjustmentTestToken);
  const headers = { Authorization: `Bearer ${adjustmentTestToken}` };
  const api = "http://127.0.0.1:3102";
  await request.post(`${api}/api/v1/wallets`, {
    headers,
    data: {
      name: "Reconciliation wallet",
      initial_amount: "100",
      colour: "#123abc",
      icon: "wallet",
    },
  });
  await page.goto("/transactions?month=2024-01");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a transaction" });
  await dialog
    .getByLabel("Type", { exact: true })
    .selectOption("balance_adjustment");
  await expect(dialog.getByLabel("Main category", { exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByLabel("Repeat", { exact: true })).toHaveCount(0);
  await dialog
    .getByLabel("Source wallet", { exact: true })
    .selectOption({ label: "Reconciliation wallet" });
  await dialog
    .getByLabel("Amount", { exact: true })
    .fill("-7.123456789012345678");
  await dialog.getByLabel("Date", { exact: true }).fill("2024-01-31");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Reconcile opening");
  await dialog
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("row").filter({ hasText: "Reconcile opening" });
  await expect(row.locator('[data-slot="badge"]')).toHaveText(
    "Balance Adjustment",
  );
  await expect(row).toContainText("effective 2024-02-01");
  const response = await request.get(
    `${api}/api/v1/transactions?type=balance_adjustment`,
    { headers },
  );
  const result = await response.json();
  expect(result.transactions[0].category_id).toBeNull();
  expect(result.summary.wallet_expenses).toEqual([]);
  expect(result.summary.currencies[0].net).toBe("0");
  const wallets = await (
    await request.get(`${api}/api/v1/wallets`, { headers })
  ).json();
  expect(wallets.wallets[0].current_amount).toBe("92.876543210987654322");
});

test("month strip stays centered, evenly padded, and scrollable on narrow screens", async ({
  context,
  page,
}, testInfo) => {
  await signInTestUser(context, transactionTestToken);
  await page.goto("/transactions?month=2024-06");
  const months = page.getByRole("navigation", { name: "Transaction months" });
  const viewport = months.locator('[data-slot="scroll-area-viewport"]');
  async function expectVerticalInset() {
    await expect
      .poll(() =>
        months.evaluate((element) => {
          const selected = element
            .querySelector('a[aria-current="page"]')
            .getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const top =
            selected.top - bounds.top - parseFloat(style.borderTopWidth);
          const bottom =
            bounds.bottom -
            selected.bottom -
            parseFloat(style.borderBottomWidth);
          return top >= 4 && bottom >= 4 && Math.abs(top - bottom) < 1;
        }),
      )
      .toBe(true);
  }
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        viewport.evaluate((element) => {
          const links = element.querySelectorAll("a");
          const first = links[0].getBoundingClientRect();
          const last = links[links.length - 1].getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return Math.abs(
            (first.left + last.right) / 2 - (bounds.left + bounds.right) / 2,
          );
        }),
      )
      .toBeLessThan(1);
    await expectVerticalInset();
    await months.screenshot({
      path: testInfo.outputPath(`month-rail-${width}.png`),
    });
  }
  for (const size of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    for (const name of ["January 2024", "December 2024"]) {
      const link = months.getByRole("link", { name, exact: true });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(link).toBeInViewport();
      await expectVerticalInset();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await months.screenshot({
      path: testInfo.outputPath(`month-rail-${size.width}.png`),
    });
  }
});

async function expectTypeColour(row, type, dark = false) {
  const badge = row.locator('[data-slot="badge"]');
  const colours = dark
    ? {
        income: ["rgb(22, 59, 37)", "rgb(187, 247, 208)"],
        expense: ["rgb(73, 31, 37)", "rgb(254, 202, 202)"],
        transfer: ["rgb(30, 50, 82)", "rgb(191, 219, 254)"],
      }
    : {
        income: ["rgb(220, 252, 231)", "rgb(22, 101, 52)"],
        expense: ["rgb(254, 226, 226)", "rgb(153, 27, 27)"],
        transfer: ["rgb(219, 234, 254)", "rgb(30, 64, 175)"],
      };
  await expect(badge).toHaveText(new RegExp(`^${type}$`, "i"));
  await expect(badge).toHaveCSS("background-color", colours[type][0]);
  await expect(badge).toHaveCSS("color", colours[type][1]);
  const contrast = await badge.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (colour) => {
      const channels = colour
        .match(/\d+/g)
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05)
    );
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("transactions support exact amounts, transfers, recurring series, filtered pagination, editing, and deletion", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, transactionTestToken);
  const headers = { Authorization: `Bearer ${transactionTestToken}` };
  const api = "http://127.0.0.1:3102";
  await page.goto("/transactions");
  await expect(page.getByText(/^No transactions for /)).toBeVisible();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(page.getByText("Create at least one")).toBeVisible();
  await page.keyboard.press("Escape");
  const wallets = [];
  for (let index = 1; index <= 12; index++) {
    const result = await request.post(`${api}/api/v1/wallets`, {
      headers,
      data: {
        name: `Transaction wallet ${index}`,
        colour: "#123abc",
        icon: "wallet",
      },
    });
    expect(result.status()).toBe(201);
    wallets.push(await result.json());
  }
  const root = await request.post(`${api}/api/v1/categories`, {
    headers,
    data: { name: "Transaction category", colour: "#123abc", icon: "house" },
  });
  const category = await root.json();
  const incomeCategory = await (
    await request.post(`${api}/api/v1/categories`, {
      headers,
      data: {
        name: "Salary category",
        kind: "income",
        colour: "#123abc",
        icon: "landmark",
      },
    })
  ).json();
  const child = await request.post(
    `${api}/api/v1/categories/${category.id}/subcategories`,
    {
      headers,
      data: { name: "Transaction child", colour: "#123abc", icon: "house" },
    },
  );
  const subcategory = await child.json();
  await page.reload();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("link", { name: "Transactions", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("region", { name: "Your transactions" });
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const add = page.getByRole("form", { name: "Add transaction", exact: true });
  await expect(
    add.getByLabel("Description", { exact: true }),
  ).not.toHaveAttribute("required");
  await add.getByLabel("Amount", { exact: true }).fill("1");
  await add.getByLabel("Date", { exact: true }).fill("2026-01-31");
  await add
    .getByLabel("Source wallet", { exact: true })
    .selectOption(wallets[0].id);
  await add
    .getByLabel("Main category", { exact: true })
    .selectOption(category.id);
  await add
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    list.getByRole("heading", { name: "Untitled transaction", exact: true }),
  ).toBeVisible();
  await transactionAction(page, "Untitled transaction", "Edit transaction");
  const unnamedEdit = page.getByRole("form", {
    name: "Edit transaction Untitled transaction",
    exact: true,
  });
  await expect(
    unnamedEdit.getByLabel("Description", { exact: true }),
  ).toHaveValue("");
  await unnamedEdit
    .getByLabel("Description", { exact: true })
    .fill("Temporary description");
  await unnamedEdit
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await transactionAction(page, "Temporary description", "Edit transaction");
  const clearingEdit = page.getByRole("form", {
    name: "Edit transaction Temporary description",
    exact: true,
  });
  await clearingEdit.getByLabel("Description", { exact: true }).fill("");
  await clearingEdit
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await transactionAction(page, "Untitled transaction", "Delete transaction");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await expect(
    list.getByRole("heading", { name: "Untitled transaction", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const amount = "12345678901234567890.123456789012345678";
  await add.getByLabel("Description", { exact: true }).fill("Transfer savings");
  await add.getByLabel("Amount", { exact: true }).fill("0");
  await add.getByLabel("Date", { exact: true }).fill("2026-01-31");
  await add.getByLabel("Type", { exact: true }).selectOption("transfer");
  await add
    .getByLabel("Source wallet", { exact: true })
    .selectOption(wallets[0].id);
  await add
    .getByLabel("Destination wallet", { exact: true })
    .selectOption(wallets[11].id);
  await add
    .getByLabel("Main category", { exact: true })
    .selectOption(category.id);
  await add
    .getByLabel("Subcategory", { exact: true })
    .selectOption(subcategory.id);
  await add
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(add.getByRole("alert")).toContainText(
    "positive income/transfer amount",
  );
  await expect(list.locator("tbody > tr")).toHaveCount(0);
  await add.getByLabel("Amount", { exact: true }).fill(amount);
  await add
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    list.getByRole("heading", { name: "Transfer savings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Add a transaction", exact: true }),
  ).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("month")).toBe("2026-01");
  await expect(
    list.getByRole("table", {
      name: "Transactions for January 2026",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    list.getByRole("columnheader", { name: "Date", exact: true }),
  ).toHaveAttribute("aria-sort", "descending");
  await expect(list.getByText(amount, { exact: true })).toBeVisible();
  await expect(
    list.getByRole("heading", { name: "January 2026", exact: true }),
  ).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Summary", exact: true });
  await expect(
    summary
      .getByRole("region", { name: "Transfers", exact: true })
      .getByText(amount, { exact: true }),
  ).toBeVisible();
  await expect(
    summary
      .getByRole("region", { name: "Net income", exact: true })
      .getByText("0", { exact: true }),
  ).toBeVisible();
  await expect(
    summary.getByRole("button", { name: "Expenses by wallet", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    summary.getByRole("region", { name: "Wallet expense totals" }),
  ).toHaveCount(0);
  const transferCells = list.locator("tbody > tr").getByRole("cell");
  await expect(transferCells.nth(4)).toContainText("€");
  await expect(transferCells.nth(1)).toContainText("Transaction wallet 1");
  await expect(transferCells.nth(1)).toContainText("to Transaction wallet 12");
  await expect(transferCells.nth(2)).toContainText("Transaction category");
  await expect(transferCells.nth(2)).toContainText("/ Transaction child");
  await expectTypeColour(list.locator("tbody > tr").first(), "transfer");
  await page.screenshot({
    path: testInfo.outputPath("transactions-populated-desktop.png"),
    fullPage: true,
  });
  const lightRowColour = await list
    .locator("tbody > tr")
    .first()
    .evaluate((row) => getComputedStyle(row).color);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expectTypeColour(list.locator("tbody > tr").first(), "transfer", true);
  await expect
    .poll(() =>
      list
        .locator("tbody > tr")
        .first()
        .evaluate((row) => getComputedStyle(row).color),
    )
    .not.toBe(lightRowColour);
  await page.screenshot({
    path: testInfo.outputPath("transactions-table-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 375, height: 812 });
  const selectedMonth = page
    .getByRole("navigation", { name: "Transaction months" })
    .getByRole("link", { name: "January 2026", exact: true });
  await expect(selectedMonth).toBeInViewport();
  const tableScroll = list.getByRole("region", {
    name: "January 2026 table, scroll horizontally",
    exact: true,
  });
  const deleteControl = list.getByRole("button", {
    name: "Actions for transaction Transfer savings on 2026-01-31",
    exact: true,
  });
  await deleteControl.scrollIntoViewIfNeeded();
  await expect(deleteControl).toBeInViewport();
  const deleteTarget = await deleteControl.boundingBox();
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("button")
          ?.getAttribute("aria-label"),
      {
        x: deleteTarget.x + deleteTarget.width / 2,
        y: deleteTarget.y + deleteTarget.height / 2,
      },
    ),
  ).toBe("Actions for transaction Transfer savings on 2026-01-31");
  await page.screenshot({
    path: testInfo.outputPath("transactions-populated-mobile.png"),
    fullPage: true,
  });
  await tableScroll.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => tableScroll.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await transactionAction(page, "Transfer savings", "Edit transaction");
  const edit = page.getByRole("form", {
    name: "Edit transaction Transfer savings",
    exact: true,
  });
  await edit.getByLabel("Description", { exact: true }).fill("Salary");
  await edit.getByLabel("Type", { exact: true }).selectOption("income");
  await expect(edit.getByLabel("Main category", { exact: true })).toHaveValue(
    "",
  );
  await expect(edit.getByLabel("Subcategory", { exact: true })).toHaveValue("");
  await expect(
    edit
      .getByLabel("Main category", { exact: true })
      .locator("option", { hasText: "Transaction category" }),
  ).toHaveCount(0);
  await edit
    .getByLabel("Main category", { exact: true })
    .selectOption(incomeCategory.id);
  await expect(
    edit.getByLabel("Destination wallet", { exact: true }),
  ).toHaveCount(0);
  await request.post(`${api}/_test/transaction-save-failure`, { headers });
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(edit.getByLabel("Description", { exact: true })).toHaveValue(
    "Salary",
  );
  await expect(edit.getByLabel("Amount", { exact: true })).toHaveValue(amount);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(
    list.getByRole("heading", { name: "Salary", exact: true }),
  ).toBeVisible();
  await expect(list).toContainText("Amount (income)");
  await expect(
    summary
      .getByRole("region", { name: "Income", exact: true })
      .getByText(amount, { exact: true }),
  ).toBeVisible();
  await expect(
    summary
      .getByRole("region", { name: "Net income", exact: true })
      .getByText(amount, { exact: true }),
  ).toBeVisible();
  await expectTypeColour(list.locator("tbody > tr").first(), "income");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expectTypeColour(list.locator("tbody > tr").first(), "income", true);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.reload();
  await page
    .getByRole("button", { name: "Transaction options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "All dates", exact: true }).click();
  await expect(page).toHaveURL(/[?&]month=all(?:&|$)/);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await add.getByLabel("Description", { exact: true }).fill("Monthly rent");
  await add.getByLabel("Amount", { exact: true }).fill("100.01");
  await add.getByLabel("Date", { exact: true }).fill("2026-01-31");
  await add
    .getByLabel("Source wallet", { exact: true })
    .selectOption(wallets[0].id);
  await add
    .getByLabel("Main category", { exact: true })
    .selectOption(category.id);
  await add.getByLabel("Repeat", { exact: true }).selectOption("monthly");
  await add
    .getByLabel("Total occurrences (blank for indefinitely)", { exact: true })
    .fill("3");
  await add
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    list.getByRole("heading", { name: "Monthly rent", exact: true }),
  ).toHaveCount(3);
  await expect(list.getByRole("table")).toHaveCount(3);
  expect(
    await list
      .getByRole("table")
      .evaluateAll((tables) =>
        tables.map((table) => table.getAttribute("aria-label")),
      ),
  ).toEqual([
    "Transactions for March 2026",
    "Transactions for February 2026",
    "Transactions for January 2026",
  ]);
  const occurrenceDates = await list
    .locator("tbody time")
    .evaluateAll((dates) => dates.map((date) => date.getAttribute("datetime")));
  expect(occurrenceDates).toEqual([...occurrenceDates].sort().reverse());
  await page.screenshot({
    path: testInfo.outputPath("transactions-month-tables.png"),
    fullPage: true,
  });
  await expect(list.locator('time[datetime="2026-02-28"]')).toBeVisible();
  const rent = list
    .locator("tbody > tr")
    .filter({
      has: page.getByRole("heading", { name: "Monthly rent", exact: true }),
    })
    .first();
  await expectTypeColour(rent, "expense");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expectTypeColour(rent, "expense", true);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await transactionAction(page, "Monthly rent", "Edit recurring series");
  const editRent = page.getByRole("form", {
    name: "Edit transaction Monthly rent",
    exact: true,
  });
  await expect(editRent.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-01-31",
  );
  await editRent
    .getByLabel("Description", { exact: true })
    .fill("Recurring rent");
  await editRent.getByRole("button", { name: "Save changes" }).click();
  await expect(
    list.getByRole("heading", { name: "Recurring rent", exact: true }),
  ).toHaveCount(3);
  for (let index = 1; index <= 11; index++) {
    const result = await request.post(`${api}/api/v1/transactions`, {
      headers,
      data: {
        description: `Groceries ${index}`,
        amount: "20.25",
        date: `2026-04-${String(index).padStart(2, "0")}`,
        type: "expense",
        source_wallet_id: wallets[0].id,
        destination_wallet_id: null,
        category_id: category.id,
        subcategory_id: subcategory.id,
        recurrence: null,
        recurrence_count: null,
      },
    });
    expect(result.status()).toBe(201);
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Filter transactions", exact: true })
    .click();
  const filters = page.getByRole("form", {
    name: "Filter transactions",
    exact: true,
  });
  await filters
    .getByLabel("Description contains", { exact: true })
    .fill("Groceries");
  await filters.getByLabel("Type", { exact: true }).selectOption("expense");
  await filters
    .getByLabel("Wallet", { exact: true })
    .selectOption(wallets[0].id);
  await filters
    .getByLabel("Main category", { exact: true })
    .selectOption(category.id);
  await filters
    .getByLabel("Subcategory", { exact: true })
    .selectOption(subcategory.id);
  await filters.getByLabel("From date", { exact: true }).fill("2026-04-01");
  await filters.getByLabel("Through date", { exact: true }).fill("2026-04-30");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  const pagination = page.getByRole("navigation", {
    name: "Transaction pagination",
  });
  await expect(pagination).toContainText("Page 1 of 2 - 11 transactions");
  await expect(
    summary
      .getByRole("region", { name: "Expenses", exact: true })
      .getByText("222.75", { exact: true }),
  ).toBeVisible();
  await expect(
    summary
      .getByRole("region", { name: "Net income", exact: true })
      .getByText("-222.75", { exact: true }),
  ).toBeVisible();
  const walletExpenses = summary.getByRole("button", {
    name: "Expenses by wallet",
    exact: true,
  });
  await expect(walletExpenses).toHaveAttribute("aria-expanded", "false");
  await walletExpenses.focus();
  await page.keyboard.press("Enter");
  await expect(walletExpenses).toHaveAttribute("aria-expanded", "true");
  const breakdown = summary.getByRole("region", {
    name: "Wallet expense totals",
  });
  await expect(breakdown).toContainText("Transaction wallet 1");
  await expect(breakdown.getByText("222.75", { exact: true })).toBeVisible();
  await expect(list.locator("tbody > tr")).toHaveCount(10);
  const firstPageDates = await list
    .locator("tbody time")
    .evaluateAll((dates) => dates.map((date) => date.getAttribute("datetime")));
  expect(firstPageDates).toEqual([...firstPageDates].sort().reverse());
  await pagination.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Groceries");
  expect(new URL(page.url()).searchParams.get("page")).toBe("2");
  await expect(list.locator("tbody > tr")).toHaveCount(1);
  await expect(
    summary
      .getByRole("region", { name: "Expenses", exact: true })
      .getByText("222.75", { exact: true }),
  ).toBeVisible();
  const secondPageDate = await list
    .locator("tbody time")
    .getAttribute("datetime");
  expect(firstPageDates.at(-1) >= secondPageDate).toBe(true);
  await page.reload();
  await expect(pagination).toContainText("Page 2 of 2 - 11 transactions");
  const types = page.getByRole("navigation", { name: "Transaction types" });
  await expect(
    types.getByRole("link", { name: "expense", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    list.getByRole("columnheader", { name: "Type", exact: true }),
  ).toHaveCount(0);
  await types.getByRole("link", { name: "All", exact: true }).click();
  await expect(pagination).toContainText("Page 1 of 2 - 11 transactions");
  const switched = new URL(page.url()).searchParams;
  expect(switched.has("type")).toBe(false);
  expect(switched.get("q")).toBe("Groceries");
  expect(switched.get("wallet_id")).toBe(wallets[0].id);
  expect(switched.get("category_id")).toBe(category.id);
  expect(switched.get("date_from")).toBe("2026-04-01");
  await expect(
    types.getByRole("link", { name: "All", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await types.getByRole("link", { name: "expense", exact: true }).click();
  await expect(
    types.getByRole("link", { name: "expense", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(pagination).toContainText("Page 1 of 2 - 11 transactions");
  await page
    .getByRole("navigation", { name: "Transaction months" })
    .getByRole("link", { name: "April 2026", exact: true })
    .click();
  await expect(page).toHaveURL(/[?&]month=2026-04(?:&|$)/);
  await expect(pagination).toContainText("Page 1 of 2 - 11 transactions");
  expect(new URL(page.url()).searchParams.get("q")).toBe("Groceries");
  expect(new URL(page.url()).searchParams.get("month")).toBe("2026-04");
  expect(new URL(page.url()).searchParams.has("date_from")).toBe(false);
  await pagination.getByRole("link", { name: "Next" }).click();
  await expect(pagination).toContainText("Page 2 of 2 - 11 transactions");
  const deleteEntry = list.getByRole("button", {
    name: /^Actions for transaction /,
  });
  await deleteEntry.click();
  await page.getByRole("menuitem", { name: /^Delete transaction / }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete transaction?",
    exact: true,
  });
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(deleteEntry).toBeFocused();
  await expect(list.locator("tbody > tr")).toHaveCount(1);
  await deleteEntry.click();
  await page.getByRole("menuitem", { name: /^Delete transaction / }).click();
  await request.post(`${api}/_test/transaction-save-failure`, { headers });
  await confirmation
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await expect(confirmation.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await expect(list.getByRole("alert")).toHaveText(
    "This transaction page does not exist.",
  );
  await expect(page.locator("#transactions-heading")).toBeFocused();
  await page.getByRole("link", { name: "Back to last page" }).click();
  await expect(pagination).toContainText("Page 1 of 1 - 10 transactions");
  await expect(
    summary
      .getByRole("region", { name: "Expenses", exact: true })
      .getByText("202.50", { exact: true }),
  ).toBeVisible();
  await page.goto("/transactions?month=all&q=Recurring+rent");
  await expect(list.locator("tbody > tr")).toHaveCount(3);
  await transactionAction(page, "Recurring rent", "Delete recurring series");
  const seriesConfirmation = page.getByRole("alertdialog", {
    name: "Delete recurring series?",
    exact: true,
  });
  await expect(seriesConfirmation).toContainText("entire recurring series");
  await seriesConfirmation
    .getByRole("button", { name: "Delete series", exact: true })
    .click();
  await expect(list.locator("tbody > tr")).toHaveCount(0);
  await page.goto("/transactions?date_from=2026-03-01&date_to=2026-02-01");
  await expect(
    page.getByRole("alert").filter({ hasText: "start date must not follow" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reset transaction filters" }).click();
  await expect(page).toHaveURL("/transactions");
  await expect(list).toBeVisible();
  const usdWallet = await (
    await request.post(`${api}/api/v1/wallets`, {
      headers,
      data: {
        name: "Dollar wallet",
        colour: "#123abc",
        icon: "wallet",
        currency: "USD",
      },
    })
  ).json();
  for (const change of [
    {
      description: "Euro expense",
      type: "expense",
      amount: "2.50",
      source_wallet_id: wallets[0].id,
    },
    {
      description: "Dollar income",
      category_id: incomeCategory.id,
      type: "income",
      amount: "10.125",
      source_wallet_id: usdWallet.id,
    },
    {
      description: "Dollar expense",
      type: "expense",
      amount: "0.025",
      source_wallet_id: usdWallet.id,
    },
  ]) {
    expect(
      (
        await request.post(`${api}/api/v1/transactions`, {
          headers,
          data: {
            date: "2023-05-01",
            category_id: category.id,
            destination_wallet_id: null,
            subcategory_id: null,
            recurrence: null,
            recurrence_count: null,
            ...change,
          },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto("/transactions?month=2023-05");
  await expect(summary).toContainText("Currencies are shown separately");
  await expect(
    summary
      .getByRole("region", { name: "Net income", exact: true })
      .getByText("-2.50", { exact: true }),
  ).toBeVisible();
  await expect(
    summary
      .getByRole("region", { name: "Net income", exact: true })
      .getByText("10.100", { exact: true }),
  ).toBeVisible();
  await expect(
    list
      .getByRole("row")
      .filter({ hasText: "Dollar income" })
      .getByRole("cell")
      .nth(4),
  ).toContainText("$ 10.125");
  await expect(
    list
      .getByRole("row")
      .filter({ hasText: "Euro expense" })
      .getByRole("cell")
      .nth(4),
  ).toContainText("€ 2.50");
  await expect(walletExpenses).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({
    path: testInfo.outputPath("transaction-summary-desktop.png"),
    fullPage: true,
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: testInfo.outputPath("transaction-summary-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await walletExpenses.click();
  await expect(breakdown).toContainText("Dollar wallet");
  await expect(breakdown.getByText("0.025", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("transaction-summary-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await expect(
    navigation.getByRole("link", { name: "Transactions", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 812, height: 375 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("transaction-summary-landscape.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(await page.content()).not.toContain(transactionTestToken);
});

test("month navigation, compact tools, and focused creation work on desktop and mobile", async ({
  context,
  page,
}, testInfo) => {
  await signInTestUser(context, transactionTestToken);
  await page.goto("/transactions?month=2024-12");
  const months = page.getByRole("navigation", { name: "Transaction months" });
  await expect(
    months.getByRole("link", { name: "December 2024", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    months.getByRole("link", { name: /^[A-Z][a-z]+ \d{4}$/ }),
  ).toHaveCount(12);
  expect(
    await months
      .getByRole("link", { name: "December 2024", exact: true })
      .innerText(),
  ).toBe("Dec");
  await page.getByRole("link", { name: "Next year", exact: true }).click();
  await expect(page).toHaveURL(/[?&]month=2025-12(?:&|$)/);
  await page.getByRole("link", { name: "Previous year", exact: true }).click();
  await expect(page).toHaveURL(/[?&]month=2024-12(?:&|$)/);
  await page
    .getByRole("button", { name: "Choose transaction year, 2024", exact: true })
    .click();
  const yearForm = page.getByRole("form", {
    name: "Choose transaction year",
    exact: true,
  });
  await expect(yearForm.getByLabel("Year", { exact: true })).toBeFocused();
  await yearForm.getByLabel("Year", { exact: true }).fill("2022");
  await yearForm.getByRole("button", { name: "Go to year" }).click();
  await expect(page).toHaveURL(/[?&]month=2022-12(?:&|$)/);
  await months.getByRole("link", { name: "March 2022", exact: true }).click();
  await expect(page).toHaveURL(/[?&]month=2022-03(?:&|$)/);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]month=2022-12(?:&|$)/);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]month=2024-12(?:&|$)/);
  await expect(
    page.getByText("No transactions for December 2024", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("transactions-desktop.png"),
    fullPage: true,
  });
  await months.getByRole("link", { name: "Next month", exact: true }).click();
  await expect(page).toHaveURL(/[?&]month=2025-01(?:&|$)/);
  await expect(
    months.getByRole("link", { name: "January 2025", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await page.reload();
  await expect(
    months.getByRole("link", { name: "December 2024", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const search = page.getByRole("button", {
    name: "Search transactions",
    exact: true,
  });
  await search.focus();
  await page.keyboard.press("Enter");
  const searchForm = page.getByRole("form", {
    name: "Search transactions",
    exact: true,
  });
  await expect(searchForm.getByLabel("Search descriptions")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  await search.click();
  await searchForm
    .getByLabel("Search descriptions")
    .fill("No matching description");
  await searchForm.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=No\+matching\+description(?:&|$)/);
  expect(new URL(page.url()).searchParams.get("month")).toBe("2024-12");
  await expect(
    page.getByText("No transactions match your filters", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .getByRole("button", { name: "Filter transactions", exact: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Filter transactions",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Description contains")).toHaveValue(
    "No matching description",
  );
  await sheet.getByLabel("Type", { exact: true }).selectOption("expense");
  await sheet
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page).toHaveURL(/[?&]type=expense(?:&|$)/);
  expect(new URL(page.url()).searchParams.get("month")).toBe("2024-12");
  const addButton = page.getByRole("button", {
    name: "Add transaction",
    exact: true,
  });
  const position = await addButton.boundingBox();
  expect(position.x + position.width).toBeLessThanOrEqual(375);
  await expect(addButton).toBeInViewport();
  await addButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Add a transaction",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(
    "2024-12-01",
  );
  await page.keyboard.press("Escape");
  await expect(addButton).toBeFocused();
  await page
    .getByText("No transactions match your filters", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByText("No transactions match your filters", { exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("transactions-mobile.png"),
    fullPage: true,
  });
});
