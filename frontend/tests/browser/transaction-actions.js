export async function transactionAction(page, description, action) {
  const escaped = description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("heading", {
        name: new RegExp(`^(?:Pinned: )?${escaped}$`),
      }),
    })
    .first();
  await row.getByRole("button", { name: /^Actions for transaction / }).click();
  await page
    .getByRole("menuitem", {
      name: ["Pin transaction", "Unpin transaction"].includes(action)
        ? action
        : `${action} ${description}`,
      exact: true,
    })
    .click();
}
