import { expect, test } from "@playwright/test";
import { signedExpenseTestToken, walletTestOrigin } from "../browser-config.js";
import { signInTestUser } from "./session.js";
import { transactionAction } from "./transaction-actions.js";

test.use({ baseURL: walletTestOrigin });

test("negative expense creation, editing and charts preserve exact values and isolate category families", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, signedExpenseTestToken);
  const api = "http://127.0.0.1:3102/api/v1";
  const headers = { Authorization: `Bearer ${signedExpenseTestToken}` };
  async function create(path, data) {
    const response = await request.post(`${api}/${path}`, { headers, data });
    expect(response.status()).toBe(201);
    return response.json();
  }
  const wallet = await create("wallets", {
    name: "Signed expense wallet",
    colour: "#123abc",
    icon: "wallet",
  });
  const expense = await create("categories", {
    name: "Signed category",
    kind: "expense",
    colour: "#123abc",
    icon: "house",
  });
  const income = await create("categories", {
    name: "Signed category",
    kind: "income",
    colour: "#123abc",
    icon: "landmark",
  });
  const child = await create(`categories/${expense.id}/subcategories`, {
    name: "Signed child",
    colour: "#123abc",
    icon: "house",
  });
  await page.goto("/transactions?month=2001-01");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Add transaction", exact: true });
  await expect(form.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "inputmode",
    "text",
  );
  await form.getByLabel("Description", { exact: true }).fill("Exact refund");
  await form
    .getByLabel("Amount", { exact: true })
    .fill("-12.123456789012345678");
  await form
    .getByLabel("Source wallet", { exact: true })
    .selectOption(wallet.id);
  await form
    .getByLabel("Main category", { exact: true })
    .selectOption(expense.id);
  await form.getByLabel("Subcategory", { exact: true }).selectOption(child.id);
  await form.getByLabel("Type", { exact: true }).selectOption("income");
  await expect(form.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "inputmode",
    "decimal",
  );
  await expect(form.getByLabel("Main category", { exact: true })).toHaveValue(
    "",
  );
  await expect(form.getByLabel("Subcategory", { exact: true })).toHaveValue("");
  await expect(
    form
      .getByLabel("Main category", { exact: true })
      .locator(`option[value="${expense.id}"]`),
  ).toHaveCount(0);
  await expect(
    form
      .getByLabel("Main category", { exact: true })
      .locator(`option[value="${income.id}"]`),
  ).toHaveCount(1);
  await form.getByLabel("Type", { exact: true }).selectOption("transfer");
  await expect(form.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "inputmode",
    "decimal",
  );
  await form.getByLabel("Type", { exact: true }).selectOption("expense");
  await expect(form.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "inputmode",
    "text",
  );
  await form
    .getByLabel("Main category", { exact: true })
    .selectOption(expense.id);
  await form
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Transactions for January 2001",
      exact: true,
    }),
  ).toContainText("+€ 12.123456789012345678");
  await transactionAction(page, "Exact refund", "Edit transaction");
  const edit = page.getByRole("form", {
    name: "Edit transaction Exact refund",
    exact: true,
  });
  await expect(edit.getByLabel("Amount", { exact: true })).toHaveValue(
    "-12.123456789012345678",
  );
  await edit
    .getByLabel("Amount", { exact: true })
    .fill("-2.123456789012345678");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("table", {
      name: "Transactions for January 2001",
      exact: true,
    }),
  ).toContainText("+€ 2.123456789012345678");
  await page.goto("/summary?year=2001");
  await expect(
    page.getByRole("region", {
      name: "EUR expense table, scroll horizontally",
    }),
  ).toContainText("-2.123456789012345678");
  await expect(page.locator(".recharts-reference-line line")).toHaveCount(2);
  await expect(
    page.locator(".recharts-reference-line line").first(),
  ).toHaveAttribute("stroke-width", "1.5");
  await expect(page.getByText("-100%", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Donut chart", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Donut view requires nonnegative category totals/),
  ).toBeVisible();
  await page
    .getByLabel("Monthly chart view", { exact: true })
    .selectOption("net");
  const netChart = page.getByRole("img", { name: /EUR monthly net income/ });
  const positiveBar = netChart.locator(".recharts-bar-rectangle path").first();
  await expect(positiveBar).toBeVisible();
  const positiveBounds = await positiveBar.boundingBox();
  const zeroBounds = await netChart
    .locator(".recharts-reference-line line")
    .boundingBox();
  expect(positiveBounds.y + positiveBounds.height).toBeLessThanOrEqual(
    zeroBounds.y + 1,
  );
  const comparisonForm = page.getByRole("form", {
    name: "Expense comparison",
    exact: true,
  });
  await comparisonForm
    .getByLabel("Compare", { exact: true })
    .selectOption("year");
  await comparisonForm.getByLabel("Year 1", { exact: true }).fill("2001");
  await comparisonForm.getByLabel("Year 2", { exact: true }).fill("2000");
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  const comparisonChart = page.getByRole("img", {
    name: "EUR selected-period category comparison, relative expense scale",
    exact: true,
  });
  const comparisonTable = page.getByRole("table", {
    name: "EUR year comparison",
    exact: true,
  });
  await expect(comparisonTable).toContainText("-2.123456789012345678");
  await expect(
    comparisonChart.getByText("-100%", { exact: true }),
  ).toBeVisible();
  const baseline = comparisonChart.locator(".recharts-reference-line line");
  await expect(baseline).toHaveCount(1);
  await expect(baseline).toHaveAttribute("stroke-width", "1.5");
  const response = await request.post(`${api}/summary/compare`, {
    headers,
    data: { kind: "year", periods: [{ year: 2001 }, { year: 2000 }] },
  });
  expect(response.status()).toBe(200);
  const comparison = await response.json();
  expect(comparison.currencies[0].categories[0].points[0]).toMatchObject({
    amount: "-2.123456789012345678",
    value: -10000,
  });
  const refundBar = comparisonChart
    .locator(".recharts-bar-rectangle path")
    .first();
  await expect(refundBar).toBeVisible();
  const barWidth = Number(await refundBar.getAttribute("width"));
  expect(barWidth).toBeLessThan(0);
  expect(Number(await refundBar.getAttribute("x")) + barWidth).toBeLessThan(
    Number(await baseline.getAttribute("x1")),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [mode, width, dark] of [
    ["desktop", 1440, false],
    ["mobile", 375, false],
    ["dark", 1440, true],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((enabled) => {
      document.documentElement.classList.toggle("dark", enabled);
    }, dark);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(
      comparisonChart.getByText("-100%", { exact: true }),
    ).toBeVisible();
    await expect(refundBar).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`signed-expense-charts-${mode}.png`),
      fullPage: true,
    });
  }
});

test("separate category sections expose income setup and income transaction choices", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, signedExpenseTestToken);
  const headers = { Authorization: `Bearer ${signedExpenseTestToken}` };
  const wallet = await request.post("http://127.0.0.1:3102/api/v1/wallets", {
    headers,
    data: {
      name: "Income selection wallet",
      colour: "#123abc",
      icon: "wallet",
    },
  });
  expect(wallet.status()).toBe(201);
  const expenseResponse = await request.post(
    "http://127.0.0.1:3102/api/v1/categories",
    {
      headers,
      data: {
        name: "Income choice expense",
        kind: "expense",
        colour: "#123abc",
        icon: "house",
      },
    },
  );
  expect(expenseResponse.status()).toBe(201);
  const expense = await expenseResponse.json();
  await page.goto("/transactions?month=2001-01");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Categories", exact: true })
    .click();
  const expenses = page.getByRole("region", {
    name: "Expense categories",
    exact: true,
  });
  const incomes = page.getByRole("region", {
    name: "Income categories",
    exact: true,
  });
  await expect(expenses).toBeVisible();
  await expect(incomes).toBeVisible();
  await expect(page.getByLabel("Category family", { exact: true })).toHaveCount(
    0,
  );
  await incomes
    .getByRole("button", { name: "Create income category", exact: true })
    .click();
  const create = page.getByRole("form", {
    name: "Create category",
    exact: true,
  });
  await expect(
    create.getByLabel("Category family", { exact: true }),
  ).toHaveValue("income");
  await create.getByLabel("Name", { exact: true }).fill("Income custom");
  await create
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(
    incomes.getByRole("heading", { name: "Income custom", exact: true }),
  ).toBeVisible();
  await expect(
    expenses.getByRole("heading", { name: "Income custom", exact: true }),
  ).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Search categories" });
  await search.fill("Income custom");
  await expect(
    incomes.getByRole("heading", { name: "Income custom", exact: true }),
  ).toBeVisible();
  await expect(expenses).toContainText("No matching expense categories");
  await page
    .getByRole("button", { name: "Clear category search", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Browse income presets", exact: true })
    .click();
  const presets = page.getByRole("dialog", {
    name: "Predefined categories",
    exact: true,
  });
  for (const name of ["Salary", "MealTicket", "Transfer", "Cash", "Other"])
    await expect(
      presets.getByRole("checkbox", { name, exact: true }),
    ).toBeVisible();
  await expect(
    presets.getByRole("checkbox", { name: "Casa", exact: true }),
  ).toHaveCount(0);
  await expect(presets).toContainText("refund, private sell");
  await presets.getByRole("checkbox", { name: "Salary", exact: true }).check();
  await presets.getByRole("checkbox", { name: "Other", exact: true }).check();
  await presets
    .getByRole("button", { name: "Add selected categories" })
    .click();
  await expect(presets).toHaveCount(0);
  await expect(
    incomes.getByRole("heading", { name: "Salary", exact: true }),
  ).toBeVisible();
  await expect(
    expenses.getByRole("heading", { name: "Salary", exact: true }),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [mode, width, height, dark] of [
    ["desktop", 1440, 1000, false],
    ["mobile", 375, 812, false],
    ["landscape", 812, 375, false],
    ["dark", 1440, 1000, true],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((enabled) => {
      document.documentElement.classList.toggle("dark", enabled);
      window.scrollTo(0, 0);
    }, dark);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`category-sections-${mode}.png`),
      fullPage: true,
    });
  }
  const card = incomes
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Other", exact: true }) });
  await card.getByRole("button", { name: "View subcategories" }).click();
  await expect(card).toContainText("refund");
  await expect(card).toContainText("private sell");
  await expect(card.getByRole("listitem")).toHaveCount(2);
  await card
    .getByRole("button", { name: "Actions for category Other", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Edit category", exact: true })
    .click();
  const edit = page.getByRole("form", {
    name: "Edit category Other",
    exact: true,
  });
  await expect(
    edit.getByText("income (cannot be changed)", { exact: true }),
  ).toBeVisible();
  await expect(edit.locator('select[name="kind"]')).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goBack();
  await expect(page).toHaveURL("/transactions?month=2001-01");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const transaction = page.getByRole("form", {
    name: "Add transaction",
    exact: true,
  });
  await transaction.getByLabel("Type", { exact: true }).selectOption("income");
  const category = transaction.getByLabel("Main category", { exact: true });
  await expect(category).toHaveAccessibleDescription(
    "Only income categories are shown.",
  );
  for (const name of ["Salary", "Other", "Income custom"])
    await expect(
      category.getByRole("option", { name, exact: true }),
    ).toHaveCount(1);
  await expect(category.locator(`option[value="${expense.id}"]`)).toHaveCount(
    0,
  );
  await category.selectOption({ label: "Other" });
  await transaction
    .getByLabel("Subcategory", { exact: true })
    .selectOption({ label: "refund" });
  await transaction.getByLabel("Type", { exact: true }).selectOption("expense");
  await expect(category).toHaveValue("");
  await expect(
    transaction.getByLabel("Subcategory", { exact: true }),
  ).toHaveValue("");
  await expect(
    category.getByRole("option", { name: "Salary", exact: true }),
  ).toHaveCount(0);
  await expect(category.locator(`option[value="${expense.id}"]`)).toHaveCount(
    1,
  );
  await transaction.getByLabel("Type", { exact: true }).selectOption("income");
  await category.selectOption({ label: "Other" });
  await transaction
    .getByLabel("Subcategory", { exact: true })
    .selectOption({ label: "private sell" });
  await transaction
    .getByLabel("Receiving wallet", { exact: true })
    .selectOption({ label: "Income selection wallet" });
  await transaction
    .getByLabel("Description", { exact: true })
    .fill("Income from preset");
  await transaction.getByLabel("Amount", { exact: true }).fill("100");
  await transaction
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Transactions for January 2001",
      exact: true,
    }),
  ).toContainText("Income from preset");
});
