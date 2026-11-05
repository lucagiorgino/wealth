export const sidebarPages = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  { id: "wallets", href: "/wallets", label: "Wallets" },
  { id: "transactions", href: "/transactions", label: "Transactions" },
  { id: "summary", href: "/summary", label: "Summary" },
  { id: "assets", href: "/assets", label: "Assets" },
  { id: "comparison", href: "/compare-spending", label: "Compare spending" },
  { id: "categories", href: "/categories", label: "Categories" },
];

export const defaultSidebarOrder = sidebarPages.map((page) => page.id);

export class SettingsInputError extends Error {}

export function validSettings(settings) {
  return (
    settings !== null &&
    typeof settings === "object" &&
    ["light", "dark"].includes(settings.theme) &&
    Array.isArray(settings.sidebar_order) &&
    settings.sidebar_order.length === defaultSidebarOrder.length &&
    new Set(settings.sidebar_order).size === defaultSidebarOrder.length &&
    settings.sidebar_order.every((id) => defaultSidebarOrder.includes(id))
  );
}

export function settingsPayload(formData) {
  const settings = {
    theme: formData.get("theme"),
    sidebar_order: formData.getAll("sidebar_order"),
  };
  if (!validSettings(settings)) {
    throw new SettingsInputError(
      "Choose light or dark and include each sidebar feature exactly once.",
    );
  }
  return settings;
}
