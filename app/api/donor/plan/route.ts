// POST /api/donor/plan { area, lat?, lng?, date, people, budget?, occasion? } -> { kits, summary, ai, donor }
// Code collects what's really in stock at shops within 6 km (live from the database), Gemini combines
// those items into kits with a short summary each, then code checks stock, expiry, budget and shops.
import { fail, json, readBody, text } from "@/lib/api";
import { formatDay, isISODate, todayIST } from "@/lib/dates";
import { suggestKits, type KitSuggestions } from "@/lib/gemini";
import { areaPoint, isPoint, roadKm, type Point } from "@/lib/geo";
import { NEARBY_KM, buildKit, candidatesFor, fallbackIdeas, placeFor, type Kit, type ShopPlace } from "@/lib/planner";
import { listActiveItems, listShops } from "@/lib/store";
import { AREA_NAMES, type ItemRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Says why there's nothing to plan: no shops near, or nearby packs expire before the date. */
function whyEmpty(items: ItemRecord[], donor: Point, date: string, shops: Map<string, ShopPlace>): string {
  const today = todayIST();
  const listed = items.filter((i) => i.status === "active" && i.stock > 0 && i.expiry_date > today);
  if (listed.length === 0) return "No shop has listed any packs yet.";
  const near = listed.filter((i) => roadKm(donor, placeFor(i, shops).point) <= NEARBY_KM);
  if (near.length === 0) {
    const nearest = Math.min(...listed.map((i) => roadKm(donor, placeFor(i, shops).point)));
    return `No shop within ${NEARBY_KM} km of you has packs listed. The nearest is about ${nearest} km away. Tap "Use my location" or change your area.`;
  }
  const last = near.map((i) => i.expiry_date).sort().at(-1)!;
  return `${near.length} ${near.length === 1 ? "pack is" : "packs are"} listed near you, but all expire by ${formatDay(last)}, before ${formatDay(date)}. Pick a donation day before ${formatDay(last)}.`;
}

export async function POST(req: Request) {
  const b = await readBody(req);
  const area = text(b?.area, 40);
  const date = b?.date;
  const people = typeof b?.people === "number" ? Math.min(2000, Math.max(1, Math.round(b.people))) : null;
  const budget = typeof b?.budget === "number" && b.budget > 0 ? Math.round(b.budget) : null;
  if (!area || !AREA_NAMES.includes(area) || !isISODate(date) || date < todayIST() || !people)
    return json({ message: "Pick a date, how many people, and your area." }, 400);
  const exact = isPoint(b?.lat, b?.lng);
  const donor: Point = exact ? { lat: b!.lat as number, lng: b!.lng as number } : areaPoint(area)!;
  const occasion = text(b?.occasion, 80);

  try {
    const [items, shopProfiles] = await Promise.all([listActiveItems(), listShops()]);
    const shops = new Map<string, ShopPlace>();
    for (const s of shopProfiles) {
      const point = isPoint(s.lat, s.lng) ? { lat: s.lat!, lng: s.lng! } : areaPoint(s.area);
      if (point) shops.set(s.id, { point, address: s.address ?? null, exact: isPoint(s.lat, s.lng) });
    }
    const cands = candidatesFor(items, donor, date, shops);
    const base = { donor: { ...donor, exact } };
    if (cands.length === 0)
      return json({ ...base, kits: [], summary: "", ai: false, message: whyEmpty(items, donor, date, shops) });

    let ai = true;
    let suggestions: KitSuggestions = { summary: "", kits: [] };
    try {
      suggestions = await suggestKits(
        cands.map((c) => ({
          id: c.item.id,
          name: [c.item.brand, c.item.product_name, c.item.net_quantity].filter(Boolean).join(" "),
          kind: c.kind,
          shop: `${c.item.shop_name} (${c.item.shop_area})`,
          km: c.km,
          price: c.price,
          mrp: Number(c.item.mrp),
          stock: c.item.stock,
          expiry: c.item.expiry_date,
        })),
        { date, people, budget, occasion },
      );
    } catch (err) {
      console.error("Kit suggestion failed, using fallback:", err instanceof Error ? err.message : err);
      ai = false;
    }
    let kits = suggestions.kits.map((i) => buildKit(i, cands, people, budget, donor)).filter((k): k is Kit => k !== null);
    let summary = kits.length > 0 ? suggestions.summary : "";
    if (kits.length === 0) {
      ai = false;
      summary = "";
      kits = fallbackIdeas(cands).map((i) => buildKit(i, cands, people, budget, donor)).filter((k): k is Kit => k !== null);
    }
    kits.sort((a, b) => b.people - a.people || a.total - b.total);
    return json({ ...base, kits, summary, ai });
  } catch (err) {
    return fail(err);
  }
}
