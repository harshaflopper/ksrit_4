// Which packaged foods AnnaSetu accepts. Only sealed, branded, ready-to-give packs
// (chips, biscuits, juice, Maggi, water, cakes). No loose or staple food: quality can't be guaranteed.
// Plain rules, never decided by the AI.

export type Tier = "green" | "amber" | "red";

export const CATEGORIES = [
  { id: "chips_namkeen", label: "Chips and namkeen", tier: "green", kind: "snack" },
  { id: "biscuits_cookies", label: "Biscuits and cookies", tier: "green", kind: "snack" },
  { id: "instant_noodles", label: "Instant noodles (Maggi, Yippee)", tier: "green", kind: "meal" },
  { id: "ready_to_eat", label: "Ready-to-eat packs", tier: "green", kind: "meal" },
  { id: "breakfast_cereal", label: "Cereal and oats packs", tier: "green", kind: "meal" },
  { id: "packaged_cakes", label: "Packaged cakes and muffins", tier: "amber", kind: "snack", note: "Packaged cakes have a short life. Give them out soon after pickup." },
  { id: "chocolates_sweets", label: "Chocolates and sweets", tier: "green", kind: "treat" },
  { id: "packaged_juice", label: "Juice and packaged drinks", tier: "green", kind: "drink" },
  { id: "tetra_milk", label: "Tetra-pack milk and milkshakes", tier: "green", kind: "drink" },
  { id: "water_bottle", label: "Packaged drinking water", tier: "green", kind: "drink" },
  { id: "other_packaged_snack", label: "Other sealed packaged food", tier: "green", kind: "snack" },
  { id: "staples", label: "Rice, atta, dal, oil (staples)", tier: "red", kind: "none", note: "Staples like rice, atta and dal aren't listed. Only ready-to-give packs such as chips, biscuits, juice and noodles." },
  { id: "fresh_dairy", label: "Fresh milk, curd, paneer", tier: "red", kind: "none", note: "Fresh dairy spoils too fast to list." },
  { id: "meat_fish_egg", label: "Meat, fish, eggs", tier: "red", kind: "none", note: "Meat, fish and eggs can't be listed." },
  { id: "cooked_food", label: "Cooked or loose food", tier: "red", kind: "none", note: "Only sealed packaged food can be listed." },
  { id: "baby_food", label: "Baby food or infant formula", tier: "red", kind: "none", note: "Baby food is too high-risk to list near expiry." },
  { id: "fresh_produce", label: "Fruit and vegetables", tier: "red", kind: "none", note: "Only sealed packaged food can be listed." },
  { id: "non_food", label: "Not food", tier: "red", kind: "none", note: "AnnaSetu lists packaged food only." },
] as const satisfies readonly { id: string; label: string; tier: Tier; kind: string; note?: string }[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function getCategory(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES.find((c) => c.id === "other_packaged_snack")!;
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}
