export const categoryPresets = [
  {
    key: "casa",
    kind: "expense",
    name: "Casa",
    colour: "#3b82f6",
    icon: "house",
    subcategories: [
      "Affitto",
      "Gas",
      "Elettricit\u00e0",
      "Internet",
      "Telefono",
      "AltroCasa",
    ].map((name) => ({ name, colour: "#3b82f6", icon: "house" })),
  },
  {
    key: "leisure",
    kind: "expense",
    name: "Leisure",
    colour: "#6366f1",
    icon: "gamepad-2",
    subcategories: [{ name: "Tech", colour: "#6366f1", icon: "gamepad-2" }],
  },
  ...[
    ["salary", "Salary"],
    ["mealticket", "MealTicket"],
    ["transfer", "Transfer"],
    ["cash", "Cash"],
    ["other", "Other"],
  ].map(([key, name]) => ({
    key: `income-${key}`,
    kind: "income",
    name,
    colour: "#21634b",
    icon: "landmark",
    subcategories: (key === "other" ? ["refund", "private sell"] : []).map(
      (name) => ({ name, colour: "#21634b", icon: "landmark" }),
    ),
  })),
];
