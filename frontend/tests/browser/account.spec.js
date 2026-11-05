import { expect, test } from "@playwright/test";
import { walletTestOrigin, walletTestToken } from "../browser-config.js";
import { signInTestUser } from "./session.js";
import { avatarPng } from "../account-fixtures.js";

test.use({ baseURL: walletTestOrigin });

test("sidebar account menu and private profile images stay synchronized with account changes", async ({
  context,
  page,
  request,
}) => {
  await signInTestUser(context);
  await page.goto("/dashboard");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const menuButton = sidebar.getByRole("button", {
    name: "Account menu",
    exact: true,
  });
  await expect(sidebar).toContainText("wallet-user@example.test");
  const position = await menuButton.boundingBox();
  expect(position.y + position.height).toBeGreaterThan(
    page.viewportSize().height - 40,
  );
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Manage account", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuButton).toBeFocused();
  await menuButton.click();
  await page
    .getByRole("menuitem", { name: "Manage account", exact: true })
    .click();
  await expect(page).toHaveURL("/account");
  await expect(menuButton).toHaveAttribute("data-variant", "secondary");
  const form = page.getByRole("form", { name: "Account profile" });
  const picture = page.getByRole("form", {
    name: "Profile picture",
    exact: true,
  });
  const choice = picture.getByLabel("Profile picture", { exact: true });
  const savePicture = picture.getByRole("button", {
    name: "Save profile picture",
    exact: true,
  });
  await expect(form.getByLabel("Display name")).toHaveValue("");
  await expect(choice).toHaveValue("user-round");
  await expect(page.getByLabel("Profile icon", { exact: true })).toHaveCount(0);
  await expect(
    picture.getByLabel("Custom profile image", { exact: true }),
  ).toHaveCount(0);
  await form.getByLabel("Display name").fill("x".repeat(101));
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Enter a display name of 1 to 100 characters.",
  );
  await expect(form.getByLabel("Display name")).toHaveValue("x".repeat(101));

  await form.getByLabel("Display name").fill("Alex");
  await choice.selectOption("cat");
  await expect(picture.locator("svg.lucide-cat")).toBeVisible();
  const response = await request.post(
    "http://127.0.0.1:3102/_test/account-save-failure",
    {
      headers: { Authorization: `Bearer ${walletTestToken}` },
    },
  );
  expect(response.status()).toBe(200);
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(form.getByRole("status")).toHaveCount(0);
  await expect(form.getByLabel("Display name")).toHaveValue("Alex");
  await expect(choice).toHaveValue("cat");
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(form.getByRole("status")).toHaveText("Account updated.");
  await expect(sidebar.getByText("Alex", { exact: true })).toBeVisible();
  await expect(sidebar.locator("svg.lucide-user-round")).toBeVisible();
  await savePicture.click();
  await expect(picture.getByRole("status")).toHaveText(
    "Profile picture updated.",
  );
  await expect(sidebar.locator("svg.lucide-cat")).toBeVisible();
  await page.reload();
  await expect(form.getByLabel("Display name")).toHaveValue("Alex");
  await expect(choice).toHaveValue("cat");
  await expect(
    page.getByText("Auth0 manages your sign-in, email, and credentials.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(walletTestToken);

  await navigation.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.locator("main").getByText("Alex", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main svg.lucide-cat")).toBeVisible();
  await page.getByRole("link", { name: "Manage account" }).click();
  await expect(page).toHaveURL("/account");
  await form.getByLabel("Display name").fill("Alex updated");
  await choice.selectOption("rocket");
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(
    sidebar.getByText("Alex updated", { exact: true }),
  ).toBeVisible();
  await expect(sidebar.locator("svg.lucide-cat")).toBeVisible();
  await savePicture.click();
  await expect(sidebar.locator("svg.lucide-rocket")).toBeVisible();
  await page.reload();
  await expect(form.getByLabel("Display name")).toHaveValue("Alex updated");
  await expect(choice).toHaveValue("rocket");

  await menuButton.click();
  await expect(
    page.getByRole("menuitem", { name: "Manage account", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("menuitem", { name: "Change profile image" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await choice.selectOption("custom");
  const upload = picture;
  await upload
    .getByLabel("Custom profile image", { exact: true })
    .setInputFiles({
      name: "not-an-image.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(upload.getByRole("alert")).toContainText("PNG, JPEG, or WebP");
  await upload
    .getByLabel("Custom profile image", { exact: true })
    .setInputFiles({
      name: "too-large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
  await expect(upload.getByRole("alert")).toContainText("2 MiB");
  await upload
    .getByLabel("Custom profile image", { exact: true })
    .setInputFiles({
      name: "custom.png",
      mimeType: "image/png",
      buffer: avatarPng,
    });
  await request.post("http://127.0.0.1:3102/_test/account-save-failure", {
    headers: { Authorization: `Bearer ${walletTestToken}` },
  });
  await upload
    .getByRole("button", { name: "Save profile picture", exact: true })
    .click();
  await expect(upload.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  expect(
    await upload
      .getByLabel("Custom profile image", { exact: true })
      .evaluate((input) => input.files[0]?.name),
  ).toBe("custom.png");
  await upload
    .getByRole("button", { name: "Save profile picture", exact: true })
    .click();
  await expect(upload.getByRole("status")).toHaveText(
    "Profile picture updated.",
  );
  await expect(
    sidebar.getByRole("img", { name: "Profile image", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByText("Alex updated", { exact: true }),
  ).toBeVisible();
  await form.getByLabel("Display name").fill("Alex with image");
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(
    sidebar.getByText("Alex with image", { exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("img", { name: "Profile image", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(choice).toHaveValue("custom");
  const savedImage = sidebar.getByRole("img", {
    name: "Profile image",
    exact: true,
  });
  await expect(savedImage).toBeVisible();
  expect(
    await savedImage.evaluate(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  ).toBe(true);
  await navigation.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page
      .locator("main")
      .getByRole("img", { name: "Profile image", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Manage account", exact: true }).click();
  await expect(page).toHaveURL(/\/account(?:#.*)?$/);
  await choice.selectOption("rocket");
  await expect(picture.locator("svg.lucide-rocket")).toBeVisible();
  await expect(
    sidebar.getByRole("img", { name: "Profile image", exact: true }),
  ).toBeVisible();
  await request.post("http://127.0.0.1:3102/_test/account-save-failure", {
    headers: { Authorization: `Bearer ${walletTestToken}` },
  });
  await savePicture.click();
  await expect(picture.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(choice).toHaveValue("rocket");
  await expect(
    sidebar.getByRole("img", { name: "Profile image", exact: true }),
  ).toBeVisible();
  await savePicture.click();
  await expect(picture.getByRole("status")).toHaveText(
    "Profile picture updated.",
  );
  await expect(
    sidebar.getByRole("img", { name: "Profile image", exact: true }),
  ).toHaveCount(0);
  await expect(sidebar.locator("svg.lucide-rocket")).toBeVisible();
  await page.reload();
  await expect(choice).toHaveValue("rocket");
  await expect(sidebar.locator("svg.lucide-rocket")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(
    page.getByRole("menuitem", { name: "Sign out", exact: true }),
  ).toHaveAttribute("href", "/auth/logout");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
