// GET /api/items -> { deals }  everything listed right now, with today's price (public feed)
import { fail, json } from "@/lib/api";
import { todayIST } from "@/lib/dates";
import { getPricing } from "@/lib/pricing";
import { listActiveItems, storageMode } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = todayIST();
    const deals = (await listActiveItems())
      .map((i) => ({ ...i, mrp: Number(i.mrp), pricing: getPricing(Number(i.mrp), i.expiry_date, today) }))
      .filter((d) => d.pricing.stage !== "expired" && d.pricing.stage !== "too_fresh" && d.stock > 0);
    return json({ deals, storage: storageMode() });
  } catch (err) {
    return fail(err);
  }
}
