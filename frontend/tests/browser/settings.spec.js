import { expect, test } from "@playwright/test";
import { settingsTestToken, walletTestOrigin } from "../browser-config.js";
import { defaultSidebarOrder, sidebarPages } from "../../lib/settings.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

test("account settings persist theme and keyboard-accessible desktop/mobile navigation order", async ({
  context,
  page,
  request,
}, testInfo) => {
  const headers = { Authorization: `Bearer ${settingsTestToken}` };
  await signInTestUser(context, settingsTestToken);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  const form = page.getByRole("form", { name: "Workspace settings" });
  const features = form.getByRole("list", { name: "Sidebar features" });
  const navigation = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  const save = form.getByRole("button", { name: "Save settings", exact: true });
  await expect(
    form.getByRole("radio", { name: "Light", exact: true }),
  ).toBeChecked();
  await expect(
    form.getByRole("button", { name: "Move Dashboard up" }),
  ).toBeDisabled();
  await expect(
    form.getByRole("button", { name: "Move Categories down" }),
  ).toBeDisabled();
  await form.getByRole("radio", { name: "Dark", exact: true }).check();
  const move = form.getByRole("button", { name: "Move Transactions up" });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(move).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    form.getByRole("button", { name: "Move Transactions down" }),
  ).toBeFocused();
  const labels = [
    "Transactions",
    "Dashboard",
    "Wallets",
    "Summary",
    "Assets",
    "Compare spending",
    "Categories",
  ];
  await expect(features.getByRole("listitem").first()).toContainText(
    "Transactions",
  );
  await expect(navigation.getByRole("link").first()).toHaveText("Dashboard");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(
    (
      await request.post("http://127.0.0.1:3102/_test/settings-save-failure", {
        headers,
      })
    ).ok(),
  ).toBe(true);
  await save.click();
  await expect(form.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(
    form.getByRole("radio", { name: "Dark", exact: true }),
  ).toBeChecked();
  await expect(features.getByRole("listitem").first()).toContainText(
    "Transactions",
  );
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(navigation.getByRole("link").first()).toHaveText("Dashboard");
  await save.click();
  await expect(form.getByRole("status")).toHaveText("Settings saved.");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(navigation.getByRole("link")).toHaveText(labels);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    form.getByRole("radio", { name: "Dark", exact: true }),
  ).toBeChecked();
  await expect(navigation.getByRole("link")).toHaveText(labels);
  const response = await context.request.get(`${walletTestOrigin}/settings`);
  expect(await response.text()).toMatch(/<html[^>]+class="[^"]*\bdark\b/);
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(navigation.getByRole("link")).toHaveText(labels);
    await page.screenshot({
      path: testInfo.outputPath(`settings-dark-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await navigation.getByRole("link", { name: "Wallets", exact: true }).click();
  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Create a wallet",
    exact: true,
  });
  await expect(dialog).toHaveCSS("color-scheme", "dark");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/settings");
  await form.getByRole("radio", { name: "Light", exact: true }).check();
  await save.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(navigation.getByRole("link")).toHaveText(labels);
  await page.screenshot({
    path: testInfo.outputPath("settings-light.png"),
    fullPage: true,
  });

  expect(
    (
      await request.post("http://127.0.0.1:3102/_test/settings-read-failure", {
        headers,
        data: { enabled: true },
      })
    ).ok(),
  ).toBe(true);
  try {
    await page.reload();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "The backend is unavailable",
    );
    await expect(form).toHaveCount(0);
    await expect(
      page.getByText("Saved settings unavailable.", { exact: false }),
    ).toBeVisible();
  } finally {
    await request.post("http://127.0.0.1:3102/_test/settings-read-failure", {
      headers,
      data: { enabled: false },
    });
  }
  await page.reload();
  await expect(navigation.getByRole("link")).toHaveText(labels);
  // Restore this owner's defaults; other browser owners have isolated preferences.
  const restored = await request.put("http://127.0.0.1:3102/api/v1/settings", {
    headers,
    data: { theme: "light", sidebar_order: defaultSidebarOrder },
  });
  expect(restored.ok()).toBe(true);
  await page.reload();
  await expect(navigation.getByRole("link")).toHaveText(
    sidebarPages.map((item) => item.label),
  );
});
