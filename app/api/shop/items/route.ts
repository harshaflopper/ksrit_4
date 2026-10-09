// GET  /api/shop/items?shop_id=...  -> { items, orders }   the shop's inventory + paid orders (notifications)
// POST /api/shop/items  { shop_id, images, audio?, note, photo }                 first try: Gemini reads the photos and
//                                                                                listens to the voice recording
//                       { shop_id, reading, audio?, note, photo, expiry?, stock?, mrp? }  follow-up: filled what was missing
// The recording is saved (public.voices) and linked to the item as voice_id; what Gemini heard goes in voice_note.
// -> { status: "added", item } | { status: "needs", needs, reading } | { status: "rejected", reasons, reading }

import { fail, json, readBody, text } from "@/lib/api";
import { addDays, isISODate, todayIST } from "@/lib/dates";
import { evaluateItem } from "@/lib/evaluate";
import { normalizeReading, readItem, type ItemReading } from "@/lib/gemini";
import { getPricing } from "@/lib/pricing";
import { addItem, addVoice, getProfile, listShopItems, listShopOrders, updateItem } from "@/lib/store";

const MAX_AUDIO = 4_000_000; // ~90 s of 16 kHz WAV as base64

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const shopId = new URL(req.url).searchParams.get("shop_id");
  if (!shopId) return json({ message: "Missing shop_id." }, 400);
  try {
    const today = todayIST();
    const [items, orders] = await Promise.all([listShopItems(shopId), listShopOrders(shopId)]);
    return json({
      items: items
        .filter((i) => i.status !== "removed")
        .map((i) => ({ ...i, mrp: Number(i.mrp), pricing: getPricing(Number(i.mrp), i.expiry_date, today) })),
      orders,
    });
  } catch (err) {
    return fail(err);
  }
}

type Need = "expiry" | "stock" | "mrp";

export async function POST(req: Request) {
  const b = await readBody(req);
  const shopId = text(b?.shop_id, 80);
  if (!b || !shopId) return json({ message: "Missing shop." }, 400);
  const note = text(b.note, 600) ?? "";
  const photo =
    typeof b.photo === "string" && b.photo.startsWith("data:image/jpeg;base64,") && b.photo.length < 400_000 ? b.photo : null;
  if (b.audio !== undefined && b.audio !== null && (typeof b.audio !== "string" || !b.audio.startsWith("data:audio/") || b.audio.length > MAX_AUDIO))
    return json({ message: "The voice note is too long. Keep it under a minute." }, 400);
  const audio = (b.audio as string | undefined) ?? null;

  try {
    const shop = await getProfile(shopId);
    if (!shop || shop.role !== "shop") return json({ message: "Set up your shop first." }, 403);

    let reading: ItemReading;
    if (b.reading && typeof b.reading === "object") {
      reading = normalizeReading(b.reading as Record<string, unknown>);
    } else {
      const images = b.images;
      if (!Array.isArray(images) || images.length < 1 || images.length > 2 || !images.every((i) => typeof i === "string" && i.startsWith("data:image/")))
        return json({ message: "Take a photo of the front and back of the pack." }, 400);
      reading = await readItem(images as string[], note, audio);
    }

    // What the shopkeeper typed in the follow-up overrides the reading.
    let confirmed = reading.expiryFromVoice || (reading.dateConfidence >= 0.8 && !reading.expiryComputed);
    if (isISODate(b.expiry)) {
      reading.expiryDate = b.expiry;
      confirmed = true;
    }
    if (typeof b.stock === "number" && b.stock >= 1) reading.stock = Math.min(999, Math.round(b.stock));
    if (typeof b.mrp === "number" && b.mrp > 0) reading.mrp = Math.round(b.mrp * 100) / 100;

    // Hard rules first (not food, opened, red category, expired, too fresh). Date rules only run on a
    // confirmed date, so a misread date gets asked about instead of rejected; once confirmed, a pack
    // that is still months from expiry is rejected.
    const dateKnown = Boolean(reading.expiryDate && confirmed);
    const check = evaluateItem({
      category: reading.category,
      mrp: reading.mrp ?? 1,
      expiryDate: dateKnown ? reading.expiryDate : addDays(todayIST(), 7),
      isFood: reading.isFood,
      isPackaged: reading.isPackaged,
      packCondition: reading.packCondition,
      dateConfirmed: true,
    });
    if (check.blockers.length > 0) return json({ status: "rejected", reasons: check.blockers, reading });

    const needs: Need[] = [];
    if (!dateKnown) needs.push("expiry");
    if (!reading.stock) needs.push("stock");
    if (!reading.mrp) needs.push("mrp");
    if (needs.length > 0) return json({ status: "needs", needs, reading });

    // Same product + same expiry already in stock: add to it instead of a new row.
    const existing = (await listShopItems(shopId)).find(
      (i) =>
        i.status === "active" &&
        i.expiry_date === reading.expiryDate &&
        i.product_name.toLowerCase() === reading.productName.toLowerCase(),
    );
    const voiceNote = [reading.voiceTranscript, note].filter(Boolean).join(" / ") || null;
    let item = existing
      ? await updateItem(existing.id, { stock: Math.min(999, existing.stock + reading.stock!), mrp: reading.mrp! })
      : await addItem({
          shop_id: shopId,
          shop_name: shop.shop_name ?? shop.name,
          shop_area: shop.area,
          product_name: reading.productName || "Packaged item",
          brand: reading.brand,
          net_quantity: reading.netQuantity,
          category: reading.category,
          mrp: reading.mrp!,
          mfg_date: reading.mfgDate,
          expiry_date: reading.expiryDate!,
          stock: reading.stock!,
          photo,
          voice_note: voiceNote,
          voice_id: null,
          status: "active",
        });
    // Keep the recording with the item so the shop can play it back.
    if (audio) {
      const voice = await addVoice({ shop_id: shopId, item_id: item.id, transcript: reading.voiceTranscript, audio });
      item = await updateItem(item.id, { voice_id: voice.id, voice_note: voiceNote });
    }
    return json({
      status: "added",
      merged: Boolean(existing),
      item: { ...item, mrp: Number(item.mrp), pricing: getPricing(Number(item.mrp), item.expiry_date) },
    });
  } catch (err) {
    return fail(err);
  }
}
