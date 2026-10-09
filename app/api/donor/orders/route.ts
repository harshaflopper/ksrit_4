// GET  /api/donor/orders?donor_id=...  -> { orders }
// POST /api/donor/orders { donor_id, date, occasion, people, perPerson: [{ itemId, qty }] }
//   -> pays the shop(s) (demo payment), takes the packs out of stock, one order per shop.
import { fail, json, readBody, text } from "@/lib/api";
import { daysBetween, isISODate, todayIST } from "@/lib/dates";
import { getPricing } from "@/lib/pricing";
import { addOrder, getProfile, listActiveItems, listDonorOrders, saveProfile, updateItem } from "@/lib/store";
import type { Order, OrderLine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("donor_id");
  if (!id) return json({ message: "Missing donor_id." }, 400);
  try {
    return json({ orders: await listDonorOrders(id) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  const b = await readBody(req);
  const donorId = text(b?.donor_id, 80);
  const date = b?.date;
  const people = typeof b?.people === "number" ? Math.round(b.people) : 0;
  const perPerson = Array.isArray(b?.perPerson) ? (b!.perPerson as { itemId: unknown; qty: unknown }[]) : [];
  if (!donorId || !isISODate(date) || date < todayIST() || people < 1 || people > 2000 || perPerson.length === 0)
    return json({ message: "Pick a kit and a date first." }, 400);

  // Add up per item, so the same item twice in one order is checked against stock once.
  const qtyById = new Map<string, number>();
  for (const l of perPerson) {
    if (typeof l.itemId !== "string") continue;
    const each = Math.min(2, Math.max(1, Math.round(Number(l.qty) || 1)));
    qtyById.set(l.itemId, (qtyById.get(l.itemId) ?? 0) + each * people);
  }
  if (qtyById.size === 0) return json({ message: "Pick a kit and a date first." }, 400);

  try {
    const donor = await getProfile(donorId);
    if (!donor || donor.role !== "donor") return json({ message: "Set up your donor profile first." }, 403);

    const today = todayIST();
    const items = new Map((await listActiveItems()).map((i) => [i.id, i]));
    const problems: string[] = [];
    const byShop = new Map<string, OrderLine[]>();
    for (const [itemId, qty] of qtyById) {
      const item = items.get(itemId);
      if (!item) { problems.push("One of the items is no longer listed."); continue; }
      if (item.stock < qty) problems.push(`${item.product_name}: only ${item.stock} left at ${item.shop_name}.`);
      if (daysBetween(date, item.expiry_date) < 1) problems.push(`${item.product_name} expires before your donation date.`);
      const price = getPricing(Number(item.mrp), item.expiry_date, today).price;
      if (!price) { problems.push(`${item.product_name} can't be sold today.`); continue; }
      const lines = byShop.get(item.shop_id) ?? [];
      lines.push({ item_id: item.id, product_name: item.product_name, qty, unit_price: price, mrp: Number(item.mrp) });
      byShop.set(item.shop_id, lines);
    }
    if (problems.length > 0) return json({ message: "Stock changed. Plan again.", problems }, 409);

    const occasion = text(b?.occasion, 80);
    const orders: Order[] = [];
    for (const [shopId, lines] of byShop) {
      const first = items.get(lines[0].item_id)!;
      for (const l of lines) {
        const item = items.get(l.item_id)!;
        const left = item.stock - l.qty;
        await updateItem(item.id, { stock: left, status: left > 0 ? "active" : "sold_out" });
      }
      orders.push(
        await addOrder({
          donor_id: donorId,
          donor_name: donor.name,
          shop_id: shopId,
          shop_name: first.shop_name,
          shop_area: first.shop_area,
          donation_date: date,
          occasion,
          people,
          lines,
          total: lines.reduce((s, l) => s + l.qty * l.unit_price, 0),
          status: "paid",
        }),
      );
    }

    // Remember the donor's dates for reminders next year.
    const label = occasion ?? "Donation";
    // A new occasion is remembered for next year. One already saved (e.g. "My birthday", even when
    // donating a few days before it) keeps its real date.
    if (!donor.dates.some((d) => d.label.toLowerCase() === label.toLowerCase() && (label !== "Donation" || d.date === date)))
      await saveProfile({ ...donor, dates: [...donor.dates, { label, date }] });

    return json({ orders }, 201);
  } catch (err) {
    return fail(err);
  }
}
