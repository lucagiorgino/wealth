import { expect, test } from "@playwright/test";
import { walletTestOrigin, walletTestToken } from "../browser-config.js";
import { signInTestUser } from "./session.js";

test.use({ baseURL: walletTestOrigin });

test("configured private pages require a session", async ({ request }) => {
  for (const path of [
    "/dashboard",
    "/wallets",
    "/account",
    "/categories",
    "/transactions",
    "/summary",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/auth/login");
  }
});

test("favicon URLs update the preview before saving and never persist a draft", async ({
  context,
  page,
  request,
}) => {
  await signInTestUser(context);
  const headers = { Authorization: `Bearer ${walletTestToken}` };
  const api = "http://127.0.0.1:3102/api/v1/wallets";
  const before = await (await request.get(api, { headers })).json();
  const remoteImages = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.com/"))
      remoteImages.push(request.url());
  });
  await page.goto("/wallets");
  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Create a wallet",
    exact: true,
  });
  const preview = editor.getByRole("group", { name: "Wallet preview" });
  await editor.getByRole("radio", { name: "Custom favicon" }).check();
  const input = editor.getByLabel("Favicon URL");
  await input.fill("https://example.com/favicon.ico");
  await expect(editor.getByRole("status")).toHaveText(
    "Loading favicon preview...",
  );
  await expect(preview.locator("img")).toHaveJSProperty("naturalWidth", 8);
  await expect(editor.getByRole("status")).toHaveText(
    "Favicon preview updated.",
  );
  await expect(preview).toHaveAttribute("aria-busy", "false");

  await input.fill("https://example.com/invalid.ico");
  await expect(editor.getByRole("alert")).toContainText(
    "favicon could not be loaded",
  );
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(preview.locator("img")).toHaveCount(0);
  await input.fill("https://example.com/unavailable.ico");
  await expect(editor.getByRole("alert")).toContainText(
    "backend is unavailable",
  );

  const slowUrl = "https://example.com/slow.ico";
  const started = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.postData()?.includes(slowUrl),
  );
  await input.fill(slowUrl);
  await started;
  await input.fill("https://example.com/alternate.ico");
  await expect(preview.locator("img")).toHaveCount(0);
  await expect(preview.locator("img")).toHaveJSProperty("naturalWidth", 16);
  await expect(input).toHaveAttribute("aria-invalid", "false");

  await input.fill("");
  await expect(preview.locator("img")).toHaveCount(0);
  await expect(editor.getByRole("alert")).toHaveCount(0);
  const next = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.postData()?.includes(slowUrl),
  );
  await input.fill(slowUrl);
  await next;
  await editor.getByRole("radio", { name: "Wallet", exact: true }).check();
  await expect(preview.locator("svg.lucide-wallet")).toBeVisible();
  await expect(preview.locator("img")).toHaveCount(0);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const after = await (await request.get(api, { headers })).json();
  expect(after.total).toBe(before.total);
  expect(remoteImages).toEqual([]);
});

test("authenticated users can create multiple wallets with exact amounts and display preferences", async ({
  context,
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await signInTestUser(context);

  await page.goto("/dashboard");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("link", { name: "Dashboard" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Your dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create wallet", exact: true }),
  ).toHaveCount(0);
  await navigation.getByRole("link", { name: "Wallets", exact: true }).click();
  await expect(page).toHaveURL("/wallets");
  await expect(
    navigation.getByRole("link", { name: "Wallets", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("region", { name: "Your wallets" });
  await expect(list).toContainText("No wallets yet");
  const pagination = page.getByRole("navigation", {
    name: "Wallet pagination",
  });
  await expect(
    pagination.getByRole("button", { name: "Previous" }),
  ).toBeDisabled();
  await expect(pagination.getByRole("button", { name: "Next" })).toBeDisabled();
  const addWallet = page.getByRole("button", {
    name: "Add wallet",
    exact: true,
  });
  await addWallet.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("dialog", {
    name: "Create a wallet",
    exact: true,
  });
  await expect(editor.getByLabel("Name", { exact: true })).toBeFocused();
  await page.getByLabel("Name", { exact: true }).fill("Everyday");
  await page
    .getByLabel("Initial amount", { exact: true })
    .fill("not-an-amount");
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Enter a valid initial amount",
  );
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(
    "Everyday",
  );
  await expect(
    editor.getByLabel("Initial amount", { exact: true }),
  ).toHaveValue("not-an-amount");
  await expect(editor).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(addWallet).toBeFocused();
  await expect(list.getByRole("table")).toHaveCount(0);

  await addWallet.click();
  await expect(editor.getByLabel("Currency", { exact: true })).toHaveValue(
    "EUR",
  );
  await page.getByLabel("Name", { exact: true }).fill("Everyday");
  await page.getByLabel("Initial amount", { exact: true }).fill("");
  await request.post("http://127.0.0.1:3102/_test/wallet-save-failure", {
    headers: { Authorization: `Bearer ${walletTestToken}` },
  });
  await editor
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(
    "Everyday",
  );
  await expect(
    editor.getByLabel("Initial amount", { exact: true }),
  ).toHaveValue("");
  await expect(
    editor.getByRole("radio", { name: "Wallet", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Wallet created.");
  await expect(editor).not.toBeVisible();
  await expect(addWallet).toBeFocused();
  await expect(list.locator("tbody tr")).toHaveCount(1);
  await expect(list.getByRole("cell", { name: "0", exact: true })).toHaveCount(
    2,
  );

  const amount = "12345678901234567890.123456789012345678";
  await addWallet.click();
  await page.getByLabel("Name", { exact: true }).fill("Savings");
  await page.getByLabel("Colour", { exact: true }).fill("#16a34a");
  await editor.getByRole("radio", { name: "Bank", exact: true }).check();
  await editor.getByLabel("Type", { exact: true }).selectOption("trading");
  const currencyOptions = editor
    .getByLabel("Currency", { exact: true })
    .locator("option");
  await expect(currencyOptions).toHaveText([
    "Euro (EUR)",
    "Dollar (USD)",
    "Sterling (GBP)",
    "Bitcoin (BTC)",
    "Ethereum (ETH)",
    "Italian lira (ITL)",
  ]);
  const slider = editor.getByRole("slider", { name: "Adjust initial amount" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(
    editor.getByLabel("Initial amount", { exact: true }),
  ).toHaveValue("-100000");
  await page.keyboard.press("ArrowRight");
  await expect(
    editor.getByLabel("Initial amount", { exact: true }),
  ).toHaveValue("-99999.99");
  await page.getByLabel("Initial amount", { exact: true }).fill(amount);
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(list.locator("tbody tr")).toHaveCount(2);
  await page.reload();
  await expect(list.getByText("Everyday", { exact: true })).toBeVisible();
  await expect(list.getByText("Savings", { exact: true })).toBeVisible();
  await expect(
    list.getByRole("row").filter({ hasText: "Savings" }),
  ).toContainText("trading");
  await expect(
    list.getByRole("cell", { name: amount, exact: true }),
  ).toHaveCount(2);
  await expect(list.locator("svg.lucide-landmark")).toHaveCSS(
    "color",
    "rgb(22, 163, 74)",
  );
  expect(await page.content()).not.toContain(walletTestToken);

  for (let index = 3; index <= 11; index++) {
    const response = await request.post(
      "http://127.0.0.1:3102/api/v1/wallets",
      {
        headers: { Authorization: `Bearer ${walletTestToken}` },
        data: { name: `Wallet ${index}`, colour: "#3b82f6", icon: "wallet" },
      },
    );
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await expect(list.locator("tbody tr")).toHaveCount(10);
  await expect(pagination).toContainText("Page 1 of 2 - 11 wallets");
  await pagination.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL("/wallets?page=2");
  await expect(list.locator("tbody tr")).toHaveCount(1);
  await expect(list.getByText("Wallet 11", { exact: true })).toBeVisible();
  await expect(list.getByText("Everyday", { exact: true })).toHaveCount(0);
  await expect(pagination.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.reload();
  await expect(pagination).toContainText("Page 2 of 2 - 11 wallets");

  await addWallet.click();
  await page.getByLabel("Name", { exact: true }).fill("Last wallet");
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(list.getByText("Last wallet", { exact: true })).toBeVisible();
  await expect(pagination).toContainText("Page 2 of 2 - 12 wallets");
  await pagination.getByRole("link", { name: "Previous" }).click();
  await expect(list.locator("tbody tr")).toHaveCount(10);

  await page.goto("/wallets?page=999");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This wallet page does not exist." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to last page" }).click();
  await expect(page).toHaveURL("/wallets?page=2");
  await page.goto("/wallets?page=invalid");
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a valid wallet page." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to first page" }).click();

  await page
    .getByRole("button", { name: "Edit wallet Savings", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit wallet", exact: true });
  await expect(edit.getByLabel("Initial amount", { exact: true })).toHaveValue(
    amount,
  );
  await edit.getByLabel("Name", { exact: true }).fill("Travel savings");
  await edit.getByLabel("Currency", { exact: true }).selectOption("USD");
  await request.post("http://127.0.0.1:3102/_test/wallet-save-failure", {
    headers: { Authorization: `Bearer ${walletTestToken}` },
  });
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toContainText(
    "The backend is unavailable",
  );
  await expect(edit.getByLabel("Name", { exact: true })).toHaveValue(
    "Travel savings",
  );
  await expect(edit.getByLabel("Currency", { exact: true })).toHaveValue("USD");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  const savings = list.getByRole("row").filter({ hasText: "Travel savings" });
  await expect(
    savings.getByRole("cell", { name: "USD", exact: true }),
  ).toBeVisible();
  await expect(
    savings.getByRole("cell", { name: amount, exact: true }),
  ).toHaveCount(2);

  await savings
    .getByRole("button", { name: "Edit wallet Travel savings" })
    .click();
  await edit.getByRole("radio", { name: "Custom favicon" }).check();
  await edit.getByLabel("Favicon URL").fill("https://example.com/favicon.ico");
  await expect(
    edit.getByRole("group", { name: "Wallet preview" }).locator("img"),
  ).toHaveJSProperty("naturalWidth", 8);
  await edit.getByLabel("Type", { exact: true }).selectOption("exchange");
  await request.post("http://127.0.0.1:3102/_test/wallet-save-failure", {
    headers: { Authorization: `Bearer ${walletTestToken}` },
  });
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toBeVisible();
  await expect(
    edit.getByRole("radio", { name: "Custom favicon" }),
  ).toBeChecked();
  await expect(edit.getByLabel("Favicon URL")).toHaveValue(
    "https://example.com/favicon.ico",
  );
  await expect(edit.getByLabel("Type", { exact: true })).toHaveValue(
    "exchange",
  );
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await expect(savings.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await page.reload();
  await savings
    .getByRole("button", { name: "Edit wallet Travel savings" })
    .click();
  await expect(edit.getByLabel("Favicon URL")).toHaveValue("");
  const editPreview = edit.getByRole("group", { name: "Wallet preview" });
  await expect(editPreview.locator("img")).toHaveJSProperty("naturalWidth", 8);
  await edit
    .getByLabel("Favicon URL")
    .fill("https://example.com/alternate.ico");
  await expect(editPreview.locator("img")).toHaveJSProperty("naturalWidth", 16);
  await edit.getByLabel("Favicon URL").fill("");
  await expect(editPreview.locator("img")).toHaveJSProperty("naturalWidth", 8);
  await expect(edit.getByLabel("Type", { exact: true })).toHaveValue(
    "exchange",
  );
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await expect(savings.locator("img")).toBeVisible();
  await expect(savings.locator("img")).toHaveJSProperty("naturalWidth", 8);
  await savings
    .getByRole("button", { name: "Edit wallet Travel savings" })
    .click();
  await edit.getByRole("radio", { name: "Bank", exact: true }).check();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await expect(savings.locator("img")).toHaveCount(0);

  const headers = { Authorization: `Bearer ${walletTestToken}` };
  const api = "http://127.0.0.1:3102";
  const owned = (
    await (await request.get(`${api}/api/v1/wallets`, { headers })).json()
  ).wallets;
  const everyday = owned.find((wallet) => wallet.name === "Everyday");
  const destination = owned.find((wallet) => wallet.name === "Wallet 3");
  const category = await (
    await request.post(`${api}/api/v1/categories`, {
      headers,
      data: { name: "Wallet balance test", colour: "#123abc", icon: "house" },
    })
  ).json();
  const incomeCategory = await (
    await request.post(`${api}/api/v1/categories`, {
      headers,
      data: {
        name: "Wallet income test",
        kind: "income",
        colour: "#123abc",
        icon: "landmark",
      },
    })
  ).json();
  for (const data of [
    { type: "income", amount: "10.125", category_id: incomeCategory.id },
    { type: "expense", amount: "4.025" },
    { type: "transfer", amount: "2", destination_wallet_id: destination.id },
    { type: "expense", amount: "999", date: "9999-12-31" },
  ]) {
    expect(
      (
        await request.post(`${api}/api/v1/transactions`, {
          headers,
          data: {
            description: "Wallet balance",
            date: "2026-01-01",
            source_wallet_id: everyday.id,
            category_id: category.id,
            ...data,
          },
        })
      ).status(),
    ).toBe(201);
  }
  await page.reload();
  const everydayRow = list.getByRole("row").filter({ hasText: "Everyday" });
  await expect(
    everydayRow.getByRole("cell", { name: "4.100", exact: true }),
  ).toBeVisible();
  await expect(
    list
      .getByRole("row")
      .filter({ hasText: "Wallet 3" })
      .getByRole("cell", { name: "2", exact: true }),
  ).toBeVisible();
  await everydayRow
    .getByRole("button", { name: "Edit wallet Everyday", exact: true })
    .click();
  await edit.getByLabel("Currency", { exact: true }).selectOption("USD");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toContainText("Currency cannot change");
  await page.keyboard.press("Escape");
  await everydayRow
    .getByRole("button", { name: "Delete wallet Everyday", exact: true })
    .click();
  const deletion = page.getByRole("alertdialog", { name: "Delete wallet?" });
  await expect(
    deletion.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await deletion
    .getByRole("button", { name: "Delete wallet", exact: true })
    .click();
  await expect(deletion.getByRole("alert")).toContainText(
    "wallet is used by transactions",
  );
  await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    everydayRow.getByRole("button", {
      name: "Delete wallet Everyday",
      exact: true,
    }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("wallets-table-desktop.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const scroll = page.getByRole("region", {
      name: "Wallet table, scroll horizontally",
    });
    await scroll.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(
      everydayRow.getByRole("button", {
        name: "Edit wallet Everyday",
        exact: true,
      }),
    ).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`wallets-table-${viewport.width}.png`),
      animations: "disabled",
      fullPage: true,
    });
    await addWallet.click();
    await editor.getByRole("radio", { name: "Custom favicon" }).check();
    await editor
      .getByLabel("Favicon URL")
      .fill("https://example.com/favicon.ico");
    await editor.getByLabel("Currency", { exact: true }).selectOption("BTC");
    await editor.getByRole("slider", { name: "Adjust initial amount" }).focus();
    await expect(editor.getByRole("slider")).toBeInViewport();
    expect(
      await editor.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`wallet-form-${viewport.width}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
  }
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: testInfo.outputPath("wallets-table-dark.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pagination.getByRole("link", { name: "Next" }).click();
  for (const name of ["Last wallet", "Wallet 11"]) {
    await page
      .getByRole("button", { name: `Delete wallet ${name}`, exact: true })
      .click();
    await deletion
      .getByRole("button", { name: "Delete wallet", exact: true })
      .click();
    await expect(deletion).not.toBeVisible();
  }
  await expect(page).toHaveURL("/wallets?page=1");
  await expect(pagination).toContainText("Page 1 of 1 - 10 wallets");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    navigation.getByRole("link", { name: "Dashboard" }),
  ).toBeVisible();
  await navigation.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your dashboard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Sign out" }),
  ).toHaveAttribute("href", "/auth/logout");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
