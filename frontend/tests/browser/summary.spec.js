import { expect, test } from "@playwright/test";
import { summaryTestToken, walletTestOrigin } from "../browser-config.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

async function assertReadableCharts(page) {
  const contrast = await page
    .locator("[data-slot=chart] text")
    .evaluateAll((nodes) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      function luminance(color) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const channels = [...context.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      }
      return nodes.map((node) => {
        const text = luminance(getComputedStyle(node).fill);
        const background = luminance(
          getComputedStyle(node.closest("[data-slot=card]")).backgroundColor,
        );
        return (
          (Math.max(text, background) + 0.05) /
          (Math.min(text, background) + 0.05)
        );
      });
    });
  expect(contrast.length).toBeGreaterThan(0);
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
}

test("yearly expense tables show exact category and subcategory totals, collapse details and hide subtotals", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, summaryTestToken);
  const api = "http://127.0.0.1:3102/api/v1";
  const headers = { Authorization: `Bearer ${summaryTestToken}` };
  const post = async (path, data) => {
    const response = await request.post(`${api}/${path}`, { headers, data });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const wallet = await post("wallets", {
    name: "Daily",
    colour: "#123abc",
    icon: "wallet",
  });
  const savings = await post("wallets", {
    name: "Savings",
    colour: "#123abc",
    icon: "wallet",
  });
  const dollars = await post("wallets", {
    name: "Dollars",
    colour: "#123abc",
    icon: "wallet",
    currency: "USD",
  });
  const home = await post("categories", {
    name: "Home",
    colour: "#123abc",
    icon: "house",
  });
  const food = await post("categories", {
    name: "Food",
    colour: "#123abc",
    icon: "house",
  });
  const salary = await post("categories", {
    name: "Salary",
    kind: "income",
    colour: "#123abc",
    icon: "landmark",
  });
  const rent = await post(`categories/${home.id}/subcategories`, {
    name: "Rent",
    colour: "#123abc",
    icon: "house",
  });
  const utilities = await post(`categories/${home.id}/subcategories`, {
    name: "Utilities",
    colour: "#123abc",
    icon: "house",
  });
  const bonus = await post(`categories/${salary.id}/subcategories`, {
    name: "Bonus",
    colour: "#123abc",
    icon: "landmark",
  });
  const base = {
    description: "",
    date: "2024-01-01",
    amount: "1",
    type: "expense",
    source_wallet_id: wallet.id,
    destination_wallet_id: null,
    category_id: home.id,
    subcategory_id: null,
    recurrence: null,
    recurrence_count: null,
  };
  const high = "12345678901234567890.123456789012345678";
  for (const change of [
    {
      date: "2023-12-31",
      amount: "10.25",
      subcategory_id: rent.id,
      recurrence: "monthly",
      recurrence_count: 3,
    },
    { amount: "0.025", subcategory_id: utilities.id },
    { date: "2024-02-01", amount: "0.1" },
    { amount: high, category_id: food.id },
    {
      amount: "100",
      type: "income",
      category_id: salary.id,
      recurrence: "monthly",
      recurrence_count: 2,
    },
    {
      amount: "200",
      type: "income",
      category_id: salary.id,
      subcategory_id: bonus.id,
      date: "2024-03-01",
    },
    {
      amount: "50",
      type: "income",
      category_id: salary.id,
      date: "2024-12-01",
    },
    { amount: "100", type: "transfer", destination_wallet_id: savings.id },
    { amount: "999", date: "9999-12-31" },
    { amount: "2.50", date: "2024-02-01", source_wallet_id: dollars.id },
  ])
    await post("transactions", { ...base, ...change });

  await page.goto("/summary?year=2024");
  await expect(
    page.getByRole("heading", { name: "Summary", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Summary", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const euro = page.getByRole("table", {
    name: "EUR expenses for 2024",
    exact: true,
  });
  const usd = page.getByRole("table", {
    name: "USD expenses for 2024",
    exact: true,
  });
  const expenseSection = page.getByRole("region", {
    name: "Expense analysis",
    exact: true,
  });
  const incomeTable = page.getByRole("table", {
    name: "EUR income for 2024",
    exact: true,
  });
  await expect(incomeTable).toBeVisible();
  await expect(incomeTable.getByRole("columnheader")).toHaveCount(14);
  const incomeTotal = incomeTable.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Total income", exact: true }),
  });
  await expect(incomeTotal.getByRole("cell").nth(0)).toContainText("100");
  await expect(incomeTotal.getByRole("cell").nth(1)).toContainText("100");
  await expect(incomeTotal.getByRole("cell").nth(2)).toContainText("200");
  await expect(incomeTotal.getByRole("cell").nth(11)).toContainText("50");
  await expect(incomeTotal.getByRole("cell").nth(12)).toContainText("450");
  await expect(
    incomeTable.getByRole("columnheader", { name: "December", exact: true }),
  ).toHaveCount(1);
  await expect(
    incomeTable.getByRole("rowheader", { name: "Bonus", exact: true }),
  ).toBeVisible();
  await expect(
    euro.getByRole("rowheader", { name: "Bonus", exact: true }),
  ).toHaveCount(0);
  const tableOrder = await page
    .locator("table")
    .evaluateAll((tables) =>
      tables.map((table) => table.getAttribute("aria-label")),
    );
  expect(tableOrder.indexOf("EUR income for 2024")).toBeGreaterThan(
    tableOrder.indexOf("USD expenses for 2024"),
  );
  const charts = page.getByRole("region", {
    name: "EUR spending charts",
    exact: true,
  });
  await expect(
    charts.getByRole("img", { name: /category ranking/ }),
  ).toBeVisible();
  await expect(
    charts.getByRole("img", { name: /monthly income and expenses/ }),
  ).toBeVisible();
  await expect(charts.locator("svg.recharts-surface")).toHaveCount(2);
  const chartBounds = await charts
    .locator("[data-slot=chart]")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
  expect(chartBounds.every((bounds) => bounds.height <= 260)).toBe(true);
  expect(chartBounds[0].height).toBe(240);
  expect(chartBounds[1].height).toBe(240);
  expect(Math.abs(chartBounds[0].y - chartBounds[1].y)).toBeLessThan(1);
  expect(chartBounds[1].x).toBeGreaterThan(chartBounds[0].x);
  const monthly = charts.getByRole("img", {
    name: /monthly income and expenses/,
  });
  await expect(monthly).not.toContainText("%");
  await expect(monthly.locator("text").filter({ hasText: /EUR$/ })).toHaveCount(
    3,
  );
  await expect(charts.getByRole("combobox")).toHaveCount(0);
  await expect(charts.getByText(/Relative scale:|Slices show/)).toHaveCount(0);
  const chartHeaders = await charts
    .locator("[data-slot=card-header]")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const title = node.querySelector("h3").getBoundingClientRect();
        const toggle = node
          .querySelector('[role="group"]')
          .getBoundingClientRect();
        return { title: title.toJSON(), toggle: toggle.toJSON() };
      }),
    );
  expect(
    chartHeaders.every(({ title, toggle }) => toggle.x >= title.right),
  ).toBe(true);
  await expect(monthly.locator(".recharts-bar")).toHaveCount(2);
  const netChart = charts.getByRole("img", { name: /monthly net income/ });
  await expect(netChart).toHaveCount(0);
  await charts
    .getByRole("button", { name: "Monthly net income", exact: true })
    .click();
  await expect(monthly).toHaveCount(0);
  await expect(netChart).toBeVisible();
  await expect(charts.locator("svg.recharts-surface")).toHaveCount(2);
  await expect(netChart.locator(".recharts-reference-line line")).toHaveCount(
    1,
  );
  const negativeBar = netChart.locator(".recharts-bar-rectangle path").first();
  await expect(negativeBar).toBeVisible();
  const negativeBounds = await negativeBar.boundingBox();
  const zeroBounds = await netChart
    .locator(".recharts-reference-line line")
    .boundingBox();
  expect(negativeBounds.y).toBeGreaterThanOrEqual(zeroBounds.y - 1);
  await netChart.locator("svg.recharts-surface").focus();
  await expect(
    netChart.locator("[data-slot=chart-tooltip-indicator]"),
  ).toHaveCSS(
    "background-color",
    await negativeBar.evaluate((node) => getComputedStyle(node).fill),
  );
  await charts
    .getByRole("button", { name: "View monthly net income data", exact: true })
    .click();
  const netData = charts.getByRole("table", {
    name: "EUR monthly net income data",
    exact: true,
  });
  await expect(
    netData.getByRole("rowheader", { name: "Dec", exact: true }),
  ).toBeVisible();
  await expect(
    netData.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: "Totals", exact: true }),
    }),
  ).toContainText("-12345678901234567460.748456789012345678");
  await charts
    .getByRole("button", { name: "Monthly income and expenses", exact: true })
    .click();
  await monthly.locator("svg.recharts-surface").focus();
  await expect(monthly.locator(".recharts-tooltip-wrapper")).toContainText(
    "Expenses",
  );
  await expect(monthly.locator(".recharts-tooltip-wrapper")).toContainText(
    "Income",
  );
  const tooltipColors = await monthly
    .locator("[data-slot=chart-tooltip-indicator]")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundColor),
    );
  const barColors = await monthly
    .locator(".recharts-legend-wrapper .shrink-0")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundColor),
    );
  expect(tooltipColors).toEqual(barColors);
  await charts
    .getByRole("button", {
      name: "View monthly income and expenses data",
      exact: true,
    })
    .click();
  const monthlyData = charts.getByRole("table", {
    name: "EUR monthly income and expenses data",
    exact: true,
  });
  const january = monthlyData
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Jan", exact: true }) });
  await expect(january.getByRole("cell").nth(1)).toContainText("100");
  await expect(january.getByRole("cell").nth(2)).toContainText(
    "-12345678901234567800.398456789012345678",
  );
  const march = monthlyData
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Mar", exact: true }) });
  await expect(march.getByRole("cell").nth(2)).toContainText("200");
  const december = monthlyData.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Dec", exact: true }),
  });
  await expect(december.getByRole("cell").nth(1)).toContainText("50");
  const chartTotals = monthlyData.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Totals", exact: true }),
  });
  await expect(chartTotals.getByRole("cell").nth(0)).toContainText(
    "12345678901234567910.748456789012345678",
  );
  await expect(chartTotals.getByRole("cell").nth(1)).toContainText("450");
  await expect(chartTotals.getByRole("cell").nth(2)).toContainText(
    "-12345678901234567460.748456789012345678",
  );
  await charts
    .getByRole("button", { name: "View category ranking data", exact: true })
    .click();
  await expect(
    charts.getByRole("table", {
      name: "EUR category ranking data",
      exact: true,
    }),
  ).toContainText(high);
  const rankingData = charts.getByRole("table", {
    name: "EUR category ranking data",
    exact: true,
  });
  const rankingRow = (name) =>
    rankingData.getByRole("row").filter({
      has: page.getByRole("rowheader", { name, exact: true }),
    });
  await expect(rankingRow("Sum")).toContainText(
    "12345678901234567910.748456789012345678",
  );
  await expect(rankingRow("Average")).toContainText(
    "6172839450617283955.374228394506172839",
  );
  const rankingSurface = charts
    .getByRole("img", { name: /category ranking/ })
    .locator("svg.recharts-surface");
  await rankingSurface.focus();
  await expect(
    charts.locator(".recharts-tooltip-wrapper").filter({ hasText: high }),
  ).toBeVisible();
  await charts
    .getByRole("button", { name: "Donut chart", exact: true })
    .click();
  await expect(
    charts.getByRole("button", { name: "Donut chart", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const donutBounds = await charts
    .locator("[data-slot=chart]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
  expect(Math.abs(donutBounds[0].y - donutBounds[1].y)).toBeLessThan(1);
  await expect(
    charts.getByRole("img", {
      name: /category ranking, relative expense scale/,
    }),
  ).toHaveCount(0);
  await expect(
    charts.getByRole("img", { name: /category ranking, donut share/ }),
  ).toBeVisible();
  await expect(charts.locator(".recharts-pie")).toHaveCount(1);
  const firstSlice = charts.locator(".recharts-pie .recharts-sector").first();
  const sliceBounds = await firstSlice.boundingBox();
  await firstSlice.hover({
    position: { x: sliceBounds.width * 0.85, y: sliceBounds.height / 2 },
  });
  await expect(
    charts.locator(".recharts-tooltip-wrapper").filter({ hasText: high }),
  ).toBeVisible();
  const donutTooltip = charts
    .getByRole("img", { name: /category ranking, donut share/ })
    .locator("[data-slot=chart-tooltip-indicator]");
  await expect(donutTooltip).toHaveCSS(
    "background-color",
    await firstSlice.evaluate((node) => getComputedStyle(node).fill),
  );
  await expect(
    charts.getByRole("list", { name: "EUR donut categories", exact: true }),
  ).toHaveCount(0);
  await charts.screenshot({
    path: testInfo.outputPath("summary-aligned-charts.png"),
    animations: "disabled",
  });
  await expect(rankingRow("Sum")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("summary-donut-desktop.png"),
    fullPage: true,
  });
  await charts.getByRole("button", { name: "Bar chart", exact: true }).click();
  await rankingSurface.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    charts.locator(".recharts-tooltip-wrapper").filter({ hasText: "20.625" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    charts.locator(".recharts-tooltip-wrapper").filter({ hasText: high }),
  ).toBeVisible();
  await expect(
    page.getByRole("form", { name: "Expense comparison", exact: true }),
  ).toHaveCount(0);
  const comparisonLink = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Compare spending", exact: true });
  await comparisonLink.click();
  await expect(page).toHaveURL("/compare-spending");
  await expect(comparisonLink).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Compare spending", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Spending charts", exact: true }),
  ).toHaveCount(0);
  const comparisonForm = page.getByRole("form", {
    name: "Expense comparison",
    exact: true,
  });
  await comparisonForm.getByLabel("Year 1", { exact: true }).fill("2024");
  await comparisonForm.getByLabel("Year 2", { exact: true }).fill("2024");
  await comparisonForm.getByLabel("Month 1", { exact: true }).selectOption("1");
  await comparisonForm.getByLabel("Month 2", { exact: true }).selectOption("2");
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  const monthComparison = page.getByRole("table", {
    name: "EUR month comparison",
    exact: true,
  });
  await expect(monthComparison).toBeVisible();
  const comparisonRow = (table, name) =>
    table
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  await expect(
    comparisonRow(monthComparison, "Food").getByRole("cell").nth(0),
  ).toContainText(high);
  await expect(
    comparisonRow(monthComparison, "Home").getByRole("cell").nth(1),
  ).toContainText("10.35");
  await expect(
    page.getByRole("table", { name: "USD month comparison", exact: true }),
  ).toContainText("2.50");
  await comparisonForm
    .getByRole("button", { name: "Add period", exact: true })
    .click();
  await comparisonForm.getByLabel("Year 3", { exact: true }).fill("2023");
  await comparisonForm
    .getByLabel("Month 3", { exact: true })
    .selectOption("12");
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  await expect(monthComparison.getByRole("columnheader")).toHaveCount(4);
  await expect(
    comparisonRow(monthComparison, "Home").getByRole("cell").nth(2),
  ).toContainText("10.25");
  await comparisonForm
    .getByRole("button", { name: "Remove period 3", exact: true })
    .click();
  await comparisonForm.getByLabel("Month 2", { exact: true }).selectOption("1");
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  await expect(comparisonForm.getByRole("alert")).toContainText("distinct");
  await expect(monthComparison.getByRole("columnheader")).toHaveCount(4);
  await comparisonForm.getByLabel("Month 2", { exact: true }).selectOption("2");
  await request.post("http://127.0.0.1:3102/_test/comparison-failure", {
    headers,
  });
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  await expect(comparisonForm.getByRole("alert")).toContainText(
    "backend is unavailable",
  );
  await expect(
    comparisonForm.getByLabel("Month 2", { exact: true }),
  ).toHaveValue("2");
  await expect(monthComparison.getByRole("columnheader")).toHaveCount(4);
  await comparisonForm
    .getByLabel("Compare", { exact: true })
    .selectOption("year");
  await comparisonForm.getByLabel("Year 1", { exact: true }).fill("2024");
  await comparisonForm.getByLabel("Year 2", { exact: true }).fill("2023");
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  const yearlyComparison = page.getByRole("table", {
    name: "EUR year comparison",
    exact: true,
  });
  await expect(
    comparisonRow(yearlyComparison, "Home").getByRole("cell").nth(0),
  ).toContainText("20.625");
  await comparisonForm
    .getByLabel("Compare", { exact: true })
    .selectOption("average");
  await comparisonForm.getByLabel("From year 1", { exact: true }).fill("2023");
  await comparisonForm.getByLabel("To year 1", { exact: true }).fill("2024");
  await comparisonForm.getByLabel("From year 2", { exact: true }).fill("2020");
  await comparisonForm.getByLabel("To year 2", { exact: true }).fill("2022");
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  const averageComparison = page.getByRole("table", {
    name: "EUR average comparison",
    exact: true,
  });
  await expect(
    comparisonRow(averageComparison, "Home").getByRole("cell").nth(0),
  ).toContainText("15.437500000000000000");
  await expect(
    page.getByRole("list", { name: "EUR comparison legend", exact: true }),
  ).toContainText("2 years");
  for (let index = 3; index <= 6; index++) {
    await comparisonForm
      .getByRole("button", { name: "Add period", exact: true })
      .click();
    await comparisonForm
      .getByLabel(`From year ${index}`, { exact: true })
      .fill(String(2025 - index));
    await comparisonForm
      .getByLabel(`To year ${index}`, { exact: true })
      .fill(String(2025 - index));
  }
  await expect(
    comparisonForm.getByRole("button", { name: "Add period", exact: true }),
  ).toBeDisabled();
  await comparisonForm
    .getByRole("button", { name: "Compare periods", exact: true })
    .click();
  await expect(averageComparison.getByRole("columnheader")).toHaveCount(7);
  await expect(
    page
      .getByRole("list", { name: "EUR comparison legend", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(6);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await assertReadableCharts(page);
  await expect(
    page.getByRole("img", {
      name: "EUR selected-period category comparison, relative expense scale",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("compare-spending-dark.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  const comparisonScroll = page.getByRole("region", {
    name: "EUR comparison table, scroll horizontally",
    exact: true,
  });
  await comparisonScroll.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => comparisonScroll.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(
    comparisonForm.getByRole("button", {
      name: "Compare periods",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("compare-spending-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/summary?year=2024");
  await charts
    .getByRole("button", { name: "View category ranking data", exact: true })
    .click();
  await expect(euro.getByRole("columnheader")).toHaveCount(14);
  await expect(
    euro.getByRole("columnheader", { name: "January", exact: true }),
  ).toBeVisible();
  await expect(
    euro.getByRole("columnheader", { name: "December", exact: true }),
  ).toHaveCount(1);
  const row = (name) =>
    euro
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  await expect(
    row("Rent").getByRole("cell").nth(0).getByText("10.25", { exact: true }),
  ).toBeVisible();
  await expect(
    row("Rent").getByRole("cell").nth(1).getByText("10.25", { exact: true }),
  ).toBeVisible();
  await expect(row("Rent").getByRole("cell").nth(12)).toContainText("20.50");
  await expect(
    euro
      .locator(`#details-EUR-${home.id}`)
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", {
          name: "Without subcategory",
          exact: true,
        }),
      })
      .getByRole("cell")
      .nth(1),
  ).toContainText("0.1");
  const footer = row("Total expenses");
  const annual = "12345678901234567910.748456789012345678";
  await expect(footer.getByRole("cell").nth(12)).toContainText(annual);
  await expect(
    usd
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", {
          name: "Total expenses",
          exact: true,
        }),
      })
      .getByRole("cell")
      .nth(12),
  ).toContainText("$ 2.50");
  const homeRow = euro.getByRole("row").filter({
    has: page.getByRole("button", {
      name: /^(Collapse|Expand) Home subcategories$/,
    }),
  });
  await expect(homeRow.getByRole("cell").nth(12)).toContainText("20.625");
  const subtotalSwitch = expenseSection.getByRole("checkbox", {
    name: "Show category totals",
    exact: true,
  });
  await subtotalSwitch.uncheck();
  await expect(homeRow).toContainText("Category totals hidden");
  await expect(homeRow.getByRole("cell")).toHaveCount(1);
  await expect(row("Rent")).toBeVisible();
  await expect(footer.getByRole("cell").nth(12)).toContainText(annual);
  await subtotalSwitch.check();
  await expenseSection
    .getByRole("button", { name: "Collapse all subcategories", exact: true })
    .click();
  await expect(
    euro.getByRole("rowheader", { name: "Rent", exact: true }),
  ).toHaveCount(0);
  await expect(homeRow.getByRole("cell").nth(12)).toContainText("20.625");
  await page.screenshot({
    path: testInfo.outputPath("summary-category-totals.png"),
    fullPage: true,
  });
  await euro
    .getByRole("button", { name: "Expand Home subcategories", exact: true })
    .click();
  await expect(row("Rent")).toBeVisible();
  await expenseSection
    .getByRole("button", { name: "Expand all subcategories", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("summary-expanded-desktop.png"),
    fullPage: true,
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await charts
    .getByRole("button", { name: "Donut chart", exact: true })
    .click();
  await assertReadableCharts(page);
  await page.screenshot({
    path: testInfo.outputPath("summary-expanded-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await assertReadableCharts(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    charts.getByRole("group", { name: "EUR monthly chart view", exact: true }),
  ).toBeVisible();
  await expect(
    charts.getByRole("button", { name: "Donut chart", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const chartDataScroll = charts.getByRole("region", {
    name: "EUR category ranking data, scroll horizontally",
    exact: true,
  });
  await chartDataScroll.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => chartDataScroll.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  const scroll = page.getByRole("region", {
    name: "EUR expense table, scroll horizontally",
    exact: true,
  });
  await scroll.scrollIntoViewIfNeeded();
  await scroll.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(
    euro.getByRole("button", {
      name: "Collapse Home subcategories",
      exact: true,
    }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("summary-expanded-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 812, height: 375 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("summary-landscape.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const years = page.getByRole("navigation", {
    name: "Summary years",
    exact: true,
  });
  await years.getByRole("link", { name: "Previous year", exact: true }).click();
  await expect(page).toHaveURL(/[?&]year=2023(?:&|$)/);
  await expect(
    page.getByRole("table", { name: "EUR expenses for 2023", exact: true }),
  ).toContainText("10.25");
  await expect(years).toHaveCount(1);
  await years.getByRole("link", { name: "Next year", exact: true }).click();
  await expect(page).toHaveURL(/[?&]year=2024(?:&|$)/);
  await expect(years).toHaveCount(1);
  await years
    .getByRole("button", { name: "Choose summary year, 2024", exact: true })
    .click();
  const yearForm = page.getByRole("form", {
    name: "Choose summary year",
    exact: true,
  });
  await expect(yearForm.getByLabel("Year", { exact: true })).toBeFocused();
  await yearForm.getByLabel("Year", { exact: true }).fill("2022");
  await yearForm
    .getByRole("button", { name: "Go to year", exact: true })
    .click();
  await expect(page).toHaveURL(/[?&]year=2022(?:&|$)/);
  await expect(
    page.getByText("No expenses in 2022", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/[?&]year=2024(?:&|$)/);
  await page.goto("/summary?year=1");
  await expect(
    years.getByRole("button", { name: "Previous year", exact: true }),
  ).toBeDisabled();
  await page.goto("/summary?year=9999");
  await expect(
    years.getByRole("button", { name: "Next year", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("No expenses in 9999", { exact: true }),
  ).toBeVisible();
  await page.goto("/summary?year=2024&year=2025");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Choose a year",
  );
  await expect(page.getByRole("table")).toHaveCount(0);
  await request.post("http://127.0.0.1:3102/_test/summary-failure", {
    headers,
  });
  await page.goto("/summary?year=2024");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "backend is unavailable",
  );
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.reload();
  await expect(euro).toBeVisible();
  expect(await page.content()).not.toContain(summaryTestToken);
});
