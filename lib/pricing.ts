// Daily-dropping price. The price is never stored: it is worked out from the
// expiry date every time an item is shown, so it falls by itself each day.
//
//   31+ days left   not listable yet (too fresh)
//   15-30 days      10% off (early listing)
//   14 days         20% off, then a bigger discount every day...
//   1 day left      80% off, must be used today
//   0 or less       expired, hidden and never sold

import { addDays, daysBetween, todayIST } from "./dates";

export const LISTING_WINDOW_DAYS = 30;
export const RAMP_START_DAYS = 14;
export const EARLY_DISCOUNT = 10;
export const RAMP_START_DISCOUNT = 20;
export const MAX_DISCOUNT = 80;

export type Stage = "too_fresh" | "early" | "dropping" | "last_day" | "expired";

export interface PricePoint {
  daysLeft: number;
  discountPct: number;
  price: number;
}

export interface Pricing {
  today: string;
  daysLeft: number;
  stage: Stage;
  discountPct: number | null;
  price: number | null;
  tomorrow: PricePoint | null;
  /** Date the daily drop starts (when 15-30 days are left). */
  dropStartsOn: string | null;
  /** One point per day from 14 days left down to 1 day left. */
  ladder: PricePoint[];
}

export function discountForDaysLeft(daysLeft: number): number | null {
  if (daysLeft <= 0 || daysLeft > LISTING_WINDOW_DAYS) return null;
  if (daysLeft > RAMP_START_DAYS) return EARLY_DISCOUNT;
  const step = (MAX_DISCOUNT - RAMP_START_DISCOUNT) / (RAMP_START_DAYS - 1);
  return Math.round(RAMP_START_DISCOUNT + (RAMP_START_DAYS - daysLeft) * step);
}

/** Price after discount, rounded down to the rupee (the donor never pays more than shown). */
export function priceAfter(mrp: number, discountPct: number): number {
  return Math.floor((mrp * (100 - discountPct)) / 100);
}

export function stageFor(daysLeft: number): Stage {
  if (daysLeft <= 0) return "expired";
  if (daysLeft === 1) return "last_day";
  if (daysLeft <= RAMP_START_DAYS) return "dropping";
  if (daysLeft <= LISTING_WINDOW_DAYS) return "early";
  return "too_fresh";
}

export function getPricing(mrp: number, expiryDate: string, today: string = todayIST()): Pricing {
  const daysLeft = daysBetween(today, expiryDate);
  const stage = stageFor(daysLeft);
  const discountPct = discountForDaysLeft(daysLeft);
  const tomorrowPct = discountForDaysLeft(daysLeft - 1);

  const ladder: PricePoint[] = [];
  for (let d = RAMP_START_DAYS; d >= 1; d--) {
    const pct = discountForDaysLeft(d)!;
    ladder.push({ daysLeft: d, discountPct: pct, price: priceAfter(mrp, pct) });
  }

  return {
    today,
    daysLeft,
    stage,
    discountPct,
    price: discountPct === null ? null : priceAfter(mrp, discountPct),
    tomorrow:
      tomorrowPct === null ? null : { daysLeft: daysLeft - 1, discountPct: tomorrowPct, price: priceAfter(mrp, tomorrowPct) },
    dropStartsOn: stage === "early" ? addDays(expiryDate, -RAMP_START_DAYS) : null,
    ladder,
  };
}
