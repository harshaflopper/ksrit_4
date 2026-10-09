// Turns AI kit ideas into real, checked offers: only nearby, in-stock items that are
// still good on the donation date, priced at today's discount. Also a no-AI fallback.

import { getCategory } from "./categories";
import { daysBetween, todayIST } from "./dates";
import { areaPoint, mapsDirections, mapsPin, roadKm, type Point } from "./geo";
import { getPricing } from "./pricing";
import type { ItemRecord } from "./types";

export const NEARBY_KM = 6;

/** Where a shop is: its saved location, or the centre of its area. */
export interface ShopPlace {
  point: Point;
  address: string | null;
  exact: boolean;
}

export interface Candidate {
  item: ItemRecord;
  price: number;
  km: number;
  kind: string;
  place: ShopPlace;
}

export interface KitLine {
  itemId: string;
  qty: number; // per person
  productName: string;
  netQuantity: string | null;
  photo: string | null;
  expiryDate: string;
  shopId: string;
  shopName: string;
  shopArea: string;
  km: number;
  price: number;
  mrp: number;
  mapUrl: string;
}

export interface KitShop {
  id: string;
  name: string;
  area: string;
  address: string | null;
  km: number;
  lat: number;
  lng: number;
  mapUrl: string;
  directionsUrl: string;
}

export interface Kit {
  title: string;
  summary: string;
  servingIdea: string;
  perPerson: KitLine[];
  people: number;
  normalPeople: number | null; // how many the same budget feeds at MRP
  costPerPerson: number;
  total: number;
  shops: KitShop[];
}

export function placeFor(item: ItemRecord, shops: Map<string, ShopPlace>): ShopPlace {
  return shops.get(item.shop_id) ?? { point: areaPoint(item.shop_area) ?? { lat: 12.9716, lng: 77.5946 }, address: null, exact: false };
}

/** Items a donor can buy today for a donation on `date`, nearest shops first. Only within NEARBY_KM. */
export function candidatesFor(
  items: ItemRecord[],
  donor: Point,
  date: string,
  shops: Map<string, ShopPlace> = new Map(),
  today = todayIST(),
): Candidate[] {
  const out: Candidate[] = [];
  for (const item of items) {
    if (item.status !== "active" || item.stock <= 0 || daysBetween(date, item.expiry_date) < 1) continue;
    const p = getPricing(Number(item.mrp), item.expiry_date, today);
    const kind = getCategory(item.category).kind;
    if (!p.price || p.stage === "expired" || p.stage === "too_fresh" || kind === "none") continue;
    const place = placeFor(item, shops);
    const km = roadKm(donor, place.point);
    if (km <= NEARBY_KM) out.push({ item, price: p.price, km, kind, place });
  }
  return out.sort((a, b) => a.km - b.km || a.price - b.price).slice(0, 40);
}

/** Checks a kit idea against real stock and money; returns null if it doesn't work. */
export function buildKit(
  idea: { title: string; summary?: string; servingIdea: string; perPerson: { itemId: string; qty: number }[] },
  cands: Candidate[],
  people: number,
  budget: number | null,
  donor: Point | null = null,
): Kit | null {
  const byId = new Map(cands.map((c) => [c.item.id, c]));
  const seen = new Set<string>();
  const lines: KitLine[] = [];
  for (const l of idea.perPerson) {
    const c = byId.get(l.itemId);
    if (!c || seen.has(l.itemId)) continue;
    seen.add(l.itemId);
    lines.push({
      itemId: c.item.id,
      qty: Math.min(2, Math.max(1, Math.round(l.qty))),
      productName: [c.item.brand, c.item.product_name].filter(Boolean).join(" "),
      netQuantity: c.item.net_quantity,
      photo: c.item.photo,
      expiryDate: c.item.expiry_date,
      shopId: c.item.shop_id,
      shopName: c.item.shop_name,
      shopArea: c.item.shop_area,
      km: c.km,
      price: c.price,
      mrp: Number(c.item.mrp),
      mapUrl: mapsPin(c.place.point),
    });
  }
  if (lines.length === 0) return null;
  const shopIds = [...new Set(lines.map((l) => l.shopId))];
  if (shopIds.length > 2) return null;

  const costPerPerson = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const mrpPerPerson = lines.reduce((s, l) => s + l.mrp * l.qty, 0);
  const byStock = Math.min(...lines.map((l) => Math.floor(byId.get(l.itemId)!.item.stock / l.qty)));
  const byBudget = budget ? Math.floor(budget / costPerPerson) : Infinity;
  const served = Math.min(people, byStock, byBudget);
  if (served < 1) return null;

  return {
    title: idea.title,
    summary: idea.summary || defaultSummary(lines, served, people),
    servingIdea: idea.servingIdea || defaultServing(lines),
    perPerson: lines,
    people: served,
    normalPeople: budget ? Math.floor(budget / mrpPerPerson) : null,
    costPerPerson,
    total: served * costPerPerson,
    shops: shopIds.map((id) => {
      const l = lines.find((x) => x.shopId === id)!;
      const place = byId.get(l.itemId)!.place;
      return {
        id,
        name: l.shopName,
        area: l.shopArea,
        address: place.address,
        km: l.km,
        lat: place.point.lat,
        lng: place.point.lng,
        mapUrl: mapsPin(place.point),
        directionsUrl: mapsDirections(donor, place.point),
      };
    }),
  };
}

function defaultSummary(lines: KitLine[], served: number, wanted: number): string {
  const shops = [...new Set(lines.map((l) => l.shopName))];
  return `${lines.map((l) => l.productName).join(" with ")} from ${shops.join(" and ")}. Feeds ${served}${served < wanted ? ` of the ${wanted}` : ""} people.`;
}

function defaultServing(lines: KitLine[]): string {
  return lines.some((l) => /maggi|noodle|yippee/i.test(l.productName))
    ? "Cook noodles in batches of 10 packs in about 1.5 litres of boiling water for 2 minutes, then add the tastemakers. Serve with the drink."
    : "Hand out one of each item per person, sealed, so everyone gets a clean pack.";
}

/** No-AI kits: pair the cheapest filling item with the cheapest drink, same shop first. */
export function fallbackIdeas(cands: Candidate[]) {
  const food = cands.filter((c) => c.kind === "meal" || c.kind === "snack" || c.kind === "treat");
  const drink = cands.filter((c) => c.kind === "drink");
  const ideas: { title: string; servingIdea: string; perPerson: { itemId: string; qty: number }[] }[] = [];
  const shops = [...new Set(cands.map((c) => c.item.shop_id))];
  for (const shop of shops) {
    const f = food.filter((c) => c.item.shop_id === shop).sort((a, b) => a.price - b.price)[0];
    const d = drink.filter((c) => c.item.shop_id === shop).sort((a, b) => a.price - b.price)[0];
    if (f && d) ideas.push({ title: `${f.item.product_name} and ${d.item.product_name}`, servingIdea: "", perPerson: [{ itemId: f.item.id, qty: 1 }, { itemId: d.item.id, qty: 1 }] });
  }
  if (ideas.length === 0 && food[0] && drink[0])
    ideas.push({ title: `${food[0].item.product_name} and ${drink[0].item.product_name}`, servingIdea: "", perPerson: [{ itemId: food[0].item.id, qty: 1 }, { itemId: drink[0].item.id, qty: 1 }] });
  if (ideas.length === 0 && food[0]) ideas.push({ title: food[0].item.product_name, servingIdea: "", perPerson: [{ itemId: food[0].item.id, qty: 1 }] });
  return ideas.slice(0, 3);
}
