// Decides whether an item can be listed. Used by the listing screen (live preview)
// and again by the server before saving, so the browser can't bypass it.

import { getCategory, type Tier } from "./categories";
import { isISODate, todayIST } from "./dates";
import { LISTING_WINDOW_DAYS, getPricing, type Pricing } from "./pricing";

export interface ItemCheckInput {
  category: string;
  mrp: number | null;
  expiryDate: string | null;
  isFood: boolean;
  isPackaged: boolean;
  packCondition: "sealed" | "opened" | "damaged" | "unclear";
  dateConfirmed: boolean;
}

export interface Evaluation {
  listable: boolean;
  tier: Tier;
  blockers: string[];
  warnings: string[];
  pricing: Pricing | null;
}

export function evaluateItem(input: ItemCheckInput, today: string = todayIST()): Evaluation {
  const category = getCategory(input.category);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.isFood) blockers.push("This doesn't look like a food item. AnnaSetu lists packaged food only.");
  else if (!input.isPackaged) blockers.push("Loose or unpackaged food can't be listed. Only sealed packs.");

  if (input.packCondition === "opened") blockers.push("Opened packs can't be listed.");
  if (input.packCondition === "damaged") blockers.push("Damaged packs can't be listed.");

  if (category.tier === "red" && "note" in category) blockers.push(category.note);

  let pricing: Pricing | null = null;
  const hasMrp = typeof input.mrp === "number" && Number.isFinite(input.mrp) && input.mrp > 0;
  if (!hasMrp) blockers.push("Add the MRP printed on the pack.");

  if (!isISODate(input.expiryDate)) {
    blockers.push("Add the expiry date printed on the pack.");
  } else {
    pricing = getPricing(hasMrp ? input.mrp! : 0, input.expiryDate, today);
    if (pricing.stage === "expired") blockers.push("This item has already expired. It can't be sold or donated.");
    if (pricing.stage === "too_fresh") {
      const months = Math.floor(pricing.daysLeft / 30);
      const left = months >= 2 ? `about ${months} months (${pricing.daysLeft} days)` : `${pricing.daysLeft} days`;
      blockers.push(
        `This item has ${left} left before expiry. Only items within ${LISTING_WINDOW_DAYS} days of expiry can be listed.`,
      );
    }
    if (pricing.stage === "last_day") warnings.push("Last day before expiry. It must be used today.");
    if (!input.dateConfirmed) blockers.push("Check the expiry date against the pack and confirm it.");
  }

  if (category.tier === "amber" && "note" in category) warnings.push(category.note);
  if (input.packCondition === "unclear") warnings.push("Make sure the pack is sealed before listing.");

  return { listable: blockers.length === 0, tier: category.tier, blockers, warnings, pricing };
}
