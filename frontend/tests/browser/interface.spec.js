import { expect, test } from "@playwright/test";
import { walletTestOrigin } from "../browser-config.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

test("every page remains readable and navigable across phone, tablet, desktop, and dark surfaces", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signInTestUser(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const remoteFontRequests = [];
  page.on("request", (request) => {
    if (/https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(request.url())) {
      remoteFontRequests.push(request.url());
    }
  });
  const routes = [
    ["/", "Your finances, in one place.", "welcome"],
    ["/dashboard", "Your dashboard", "dashboard"],
    ["/wallets", "Wallets", "wallets"],
    ["/transactions?month=2024-12", "Transactions", "transactions"],
    ["/summary?year=2024", "Summary", "summary"],
    ["/categories", "Categories", "categories"],
    ["/account", "Your account", "account"],
    ["/settings", "Settings", "settings"],
  ];
  for (const [route, heading, name] of routes) {
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("body")).toHaveCSS(
        "font-family",
        /IBM Plex Sans/i,
      );
      await expect(page.locator("h1")).toHaveCSS(
        "font-family",
        /IBM Plex Sans/i,
      );
      expect(
        await page.evaluate(async () => {
          await document.fonts.ready;
          return [...document.fonts].some(
            (font) =>
              font.family.includes("IBM Plex Sans") && font.status === "loaded",
          );
        }),
      ).toBe(true);
      const numberFonts = await page
        .locator("main .tabular-nums")
        .evaluateAll((elements) => [
          ...new Set(
            elements.map((element) => getComputedStyle(element).fontFamily),
          ),
        ]);
      for (const font of numberFonts) {
        expect(font, `${name} numeric typography`).toMatch(/IBM Plex Sans/i);
      }
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${name} overflows at ${width}px`,
      ).toBe(true);
      if (route !== "/") {
        const nav = page.getByRole("navigation", {
          name: "Main navigation",
          exact: true,
        });
        await expect(nav.getByRole("link")).toHaveCount(5);
        for (const link of await nav.getByRole("link").all()) {
          await expect(link).toBeInViewport();
          const box = await link.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await expect(
          page.getByRole("button", { name: "Account menu", exact: true }),
        ).toBeInViewport();
      }
      if ([375, 1440].includes(width)) {
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const contrast = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const luminance = (colour) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = colour;
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
      };
      const ratio = (foreground, background) => {
        const values = [luminance(foreground), luminance(background)];
        return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
      };
      const body = getComputedStyle(document.body);
      const ratios = [ratio(body.color, body.backgroundColor)];
      const eyebrow = document.querySelector("main .text-primary-ink");
      if (eyebrow) {
        ratios.push(
          ratio(getComputedStyle(eyebrow).color, body.backgroundColor),
        );
      }
      const taskCard = document.querySelector(
        '[aria-labelledby="workspace-heading"] a',
      );
      if (taskCard) {
        const style = getComputedStyle(taskCard);
        ratios.push(ratio(style.color, style.backgroundColor));
      }
      return ratios;
    });
    for (const ratio of contrast) {
      expect(ratio, `${name} dark text contrast`).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({
      path: testInfo.outputPath(`${name}-dark.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 375, height: 480 });
  await page.goto("/wallets");
  const createWallet = page.getByRole("button", {
    name: "Add wallet",
    exact: true,
  });
  await createWallet.click();
  const walletEditor = page.getByRole("dialog", {
    name: "Create a wallet",
    exact: true,
  });
  await expect(walletEditor.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(walletEditor).toHaveCSS("animation-name", "none");
  await walletEditor.getByLabel("Name", { exact: true }).fill("Preview only");
  const create = walletEditor.getByRole("button", {
    name: "Create wallet",
    exact: true,
  });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeInViewport();
  const bounds = await walletEditor.boundingBox();
  expect(bounds.height).toBeLessThanOrEqual(448);
  expect(bounds.width).toBeLessThanOrEqual(343);
  await page.screenshot({
    path: testInfo.outputPath("wallet-editor-small-phone.png"),
  });
  await walletEditor
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(createWallet).toBeFocused();
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/account");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const accountMenu = page.getByRole("button", {
    name: "Account menu",
    exact: true,
  });
  await accountMenu.scrollIntoViewIfNeeded();
  await accountMenu.click();
  await expect(
    page.getByRole("menuitem", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  expect(remoteFontRequests).toEqual([]);
});

test("shared preset controls, surfaces, and dialog titles stay consistent across pages", async ({
  context,
  page,
}) => {
  await signInTestUser(context);
  const appearance = (element) => {
    const style = getComputedStyle(element);
    return {
      radius: style.borderTopLeftRadius,
      font: style.fontFamily,
      size: style.fontSize,
    };
  };
  await page.goto("/summary?year=2024");
  const yearArrow = await page
    .getByRole("link", { name: "Previous year", exact: true })
    .evaluate(appearance);
  await page.goto("/transactions?month=2024-12");
  const monthArrow = page.getByRole("link", {
    name: "Previous month",
    exact: true,
  });
  expect(await monthArrow.evaluate(appearance)).toEqual(yearArrow);

  await page.goto("/settings");
  const card = page.locator('[data-slot="card"]').first();
  const { radius } = await card.evaluate(appearance);
  const sharedTitle = await page
    .locator('[data-slot="card-title"]')
    .first()
    .evaluate(appearance);
  await expect(
    page.getByRole("radio", { name: "Light", exact: true }).locator(".."),
  ).toHaveCSS("border-top-left-radius", radius);
  await expect(
    page
      .getByRole("list", { name: "Sidebar features" })
      .getByRole("listitem")
      .first(),
  ).toHaveCSS("border-top-left-radius", radius);

  await page.goto("/wallets");
  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  const walletTitle = await page
    .locator('[data-slot="dialog-title"]')
    .evaluate(appearance);
  expect(walletTitle).toEqual(sharedTitle);
  const close = page.getByRole("button", { name: "Close", exact: true });
  await expect
    .poll(async () => {
      const bounds = await close.boundingBox();
      return Math.min(bounds.width, bounds.height);
    })
    .toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/categories");
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  expect(
    await page.locator('[data-slot="dialog-title"]').evaluate(appearance),
  ).toEqual(walletTitle);
});
