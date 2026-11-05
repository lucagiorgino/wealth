import { expect, test } from "@playwright/test";

test("unconfigured landing page is honest and private routes stay closed", async ({
  page,
}) => {
  const assetFailures = [];
  page.on("response", (response) => {
    if (response.url().includes("/_next/static/") && !response.ok()) {
      assetFailures.push(response.url());
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your finances, in one place." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Authentication setup required",
  );
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
  await page.goto("/wallets");
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await expect(page).toHaveURL("/");
  await page.goto("/settings");
  await expect(page).toHaveURL("/");
  await page.goto("/categories");
  await expect(page).toHaveURL("/");
  await page.goto("/transactions");
  await expect(page).toHaveURL("/");
  await page.goto("/summary");
  await expect(page).toHaveURL("/");
  await page.goto("/compare-spending");
  await expect(page).toHaveURL("/");
  await page.goto("/assets");
  await expect(page).toHaveURL("/");
  await page.goto("/auth/login");
  await expect(page).toHaveURL("/");
  expect(assetFailures).toEqual([]);
});
