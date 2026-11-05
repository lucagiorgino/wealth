import { expect, test } from "@playwright/test";
import { assetTestToken, walletTestOrigin } from "../browser-config.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

test("Assets keeps Summary charts aligned, shows exact patrimony and preserves failed valuation edits", async ({
  context,
  page,
  request,
}, testInfo) => {
  await signInTestUser(context, assetTestToken);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const headers = { Authorization: `Bearer ${assetTestToken}` };
  const api = "http://127.0.0.1:3102";
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7)) - 1;
  const post = async (path, data) => {
    const response = await request.post(`${api}/api/v1/${path}`, {
      headers,
      data,
    });
    expect(response.status()).toBe(201);
    return response.json();
  };
  await post("wallets", {
    name: "Everyday cash",
    initial_amount: "1000",
    colour: "#123abc",
    icon: "wallet",
  });
  for (const [name, asset_group, amount] of [
    ["Index fund", "stocks", "2000"],
    ["Digital holdings", "crypto", "250"],
    ["Government bond", "bonds", "500"],
    ["Loan", "liabilities", "300"],
  ])
    await post("assets", {
      name,
      asset_group,
      amount,
      currency: "EUR",
      date: "2023-12-31",
    });

  await page.goto("/assets?year=2024");
  await expect(
    page.getByRole("heading", { name: "Assets", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Assets", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const table = page.getByRole("table", {
    name: "EUR monthly assets",
    exact: true,
  });
  const row = (name) =>
    table
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) });
  await expect(table.getByRole("columnheader")).toHaveCount(13);
  await expect(
    table.getByRole("columnheader", { name: /^(Opening|Latest)$/ }),
  ).toHaveCount(0);
  await expect(row("Net worth").getByRole("cell")).toHaveCount(12);
  await expect(row("Net worth").getByRole("cell").last()).toContainText("3450");
  await expect(row("Everyday cash").getByRole("cell").nth(0)).toContainText(
    "1000",
  );
  await expect(row("Loan").getByRole("cell").last()).toContainText("300");
  await expect(row("Monthly change (%)").getByRole("cell").nth(0)).toHaveText(
    "0%",
  );

  const charts = page.locator("[data-slot=chart]");
  await expect(charts).toHaveCount(2);
  const first = await charts.nth(0).boundingBox();
  const second = await charts.nth(1).boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
  expect(first.height).toBe(second.height);
  for (const title of ["Monthly net worth", "Asset allocation"]) {
    const heading = page.getByRole("heading", { name: title, exact: true });
    const card = page.locator("[data-slot=card]").filter({ has: heading });
    const titleBox = await heading.boundingBox();
    const toggleBox = await card.getByRole("group").boundingBox();
    expect(toggleBox.x).toBeGreaterThan(titleBox.x);
    expect(
      Math.abs(
        titleBox.y + titleBox.height / 2 - (toggleBox.y + toggleBox.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
  }
  const trend = page.getByRole("group", { name: "EUR net worth chart view" });
  await trend.getByRole("button", { name: "Bar chart", exact: true }).click();
  await expect(
    trend.getByRole("button", { name: "Bar chart", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const chartSvg = charts.first().locator("svg[tabindex='0']");
  await chartSvg.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    charts.first().locator("[data-slot=chart-tooltip-indicator]"),
  ).toBeVisible();
  await expect(charts.first()).toContainText("3450");
  const indicator = await charts
    .first()
    .locator("[data-slot=chart-tooltip-indicator]")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(indicator).not.toBe("rgba(0, 0, 0, 0)");
  await trend.getByRole("button", { name: "Line chart", exact: true }).click();
  const allocation = page.getByRole("group", {
    name: "EUR allocation chart view",
  });
  await allocation.getByRole("button", { name: "Donut chart" }).click();
  await expect(charts.nth(1).locator(".recharts-pie-sector")).toHaveCount(4);
  await page.screenshot({
    path: testInfo.outputPath("assets-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Hide holdings" }).click();
  await expect(row("Index fund")).toHaveCount(0);
  await page.getByRole("button", { name: "Show holdings" }).click();
  await expect(row("Index fund")).toBeVisible();
  const historical = await (
    await request.get(`${api}/api/v1/assets?year=2024`, { headers })
  ).json();
  const fund = historical.currencies[0].groups.find(
    (group) => group.key === "stocks",
  ).holdings[0];
  await request.put(`${api}/api/v1/assets/${fund.id}/valuations`, {
    headers,
    data: { date: "2024-01-31", amount: "9999" },
  });
  await page.reload();
  await expect(row("Index fund").getByRole("cell").nth(0)).toContainText(
    "2000",
  );
  await request.delete(`${api}/api/v1/assets/${fund.id}`, { headers });
  await page.reload();
  await expect(row("Index fund")).toContainText(
    "Closed holding: frozen history",
  );
  await expect(row("Index fund").getByRole("cell").nth(0)).toContainText(
    "2000",
  );
  await expect(row("Index fund").getByRole("button")).toHaveCount(0);
  await page.goto(`/assets?year=${currentYear}`);
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Add an asset or liability",
  });
  await dialog.getByLabel("Name", { exact: true }).fill("Property");
  await dialog.getByLabel("Asset group").selectOption("other");
  await dialog.getByLabel("Valuation date").fill(`${today.slice(0, 7)}-01`);
  await dialog
    .getByLabel("Value (EUR)", { exact: true })
    .fill("10000.000000000000000001");
  await request.post(`${api}/_test/asset-save-failure`, { headers });
  await dialog.getByRole("button", { name: "Add asset", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "backend is unavailable",
  );
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Property",
  );
  await expect(dialog.getByLabel("Value (EUR)", { exact: true })).toHaveValue(
    "10000.000000000000000001",
  );
  await dialog.getByRole("button", { name: "Add asset", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    row("Property").getByRole("cell").nth(currentMonth),
  ).toContainText("10000.000000000000000001");
  await page
    .getByRole("button", { name: "Record valuation for Property", exact: true })
    .click();
  const valuation = page.getByRole("dialog", {
    name: "Value Property",
    exact: true,
  });
  await valuation.getByLabel("Valuation date").fill(today);
  await valuation.getByLabel("Value (EUR)", { exact: true }).fill("10100.25");
  await valuation.getByRole("button", { name: "Save valuation" }).click();
  await expect(valuation).not.toBeVisible();
  await expect(
    row("Property").getByRole("cell").nth(currentMonth),
  ).toContainText("10100.25");
  await expect(
    row("Property").getByRole("cell").nth(currentMonth),
  ).toContainText("10100.25");
  await page.reload();
  await expect(
    row("Property").getByRole("cell").nth(currentMonth),
  ).toContainText("10100.25");
  const cash = (
    await (await request.get(`${api}/api/v1/wallets`, { headers })).json()
  ).wallets[0];
  const spending = await post("categories", {
    name: "Live spending",
    colour: "#123abc",
    icon: "house",
  });
  await post("transactions", {
    type: "expense",
    amount: "5",
    date: today,
    source_wallet_id: cash.id,
    category_id: spending.id,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    row("Everyday cash").getByRole("cell").nth(currentMonth),
  ).toContainText("995");

  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const region = page.getByRole("region", {
    name: "EUR monthly assets, scroll horizontally",
  });
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: testInfo.outputPath("assets-mobile-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Delete asset Property", exact: true })
    .click();
  const deletion = page.getByRole("dialog", { name: "Delete Property?" });
  await expect(deletion).toContainText("every recorded valuation");
  await deletion
    .getByRole("button", { name: "Delete asset and valuations" })
    .click();
  await expect(deletion).not.toBeVisible();
  await expect(row("Property")).toHaveCount(0);

  await page
    .getByRole("button", { name: `Choose assets year, ${currentYear}` })
    .click();
  const yearForm = page.getByRole("form", {
    name: "Choose assets year",
    exact: true,
  });
  await yearForm.getByLabel("Year").fill("2023");
  await yearForm.getByRole("button", { name: "Go to year" }).click();
  await expect(page).toHaveURL("/assets?year=2023");
  await request.post(`${api}/_test/asset-read-failure`, {
    headers,
    data: { enabled: true },
  });
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "backend is unavailable",
  );
  await expect(page.getByText("No assets yet", { exact: true })).toHaveCount(0);
  await request.post(`${api}/_test/asset-read-failure`, {
    headers,
    data: { enabled: false },
  });
});
