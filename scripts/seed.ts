// Demo data: two real-looking kirana shops (SH1 in Koramangala, SH2 in BTM Layout) with
// near-expiry packed food. Writes to Supabase when it's set in .env.local, else .data/.
// Both shops are within 6 km by road of HSR Layout, BTM Layout, Koramangala and Jayanagar.
// Expiry dates are counted from the day you run it (8-20 days out), so the packs are always
// listable and last past a donation up to a week away.
// Running it again replaces the demo shops' items; real shops are not touched.
//
// Product photos: Open Food Facts (https://world.openfoodfacts.org), CC BY-SA 3.0.
//
// Run: npm run seed

import { existsSync } from "node:fs";
import { addDays, todayIST } from "../lib/dates";
import type { ItemRecord, Profile } from "../lib/types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type Shop = Omit<Profile, "created_at">;
type Product = {
  shop: "SH1" | "SH2";
  barcode: string; // Open Food Facts product, for the photo
  brand: string;
  name: string;
  qty: string;
  category: string;
  mrp: number;
  stock: number;
  daysLeft: number;
};

const SHOPS: Shop[] = [
  {
    id: "SH1",
    role: "shop",
    name: "Ganesh Rao",
    shop_name: "Sri Ganesh Stores",
    area: "Koramangala",
    address: "80 Feet Road, 4th Block, Koramangala",
    lat: 12.9333,
    lng: 77.626,
    phone: null,
    email: null,
    birthday: null,
    dates: [],
  },
  {
    id: "SH2",
    role: "shop",
    name: "Lakshmi Devi",
    shop_name: "Lakshmi Provisions",
    area: "BTM Layout",
    address: "16th Main Road, BTM Layout 2nd Stage",
    lat: 12.9166,
    lng: 77.6101,
    phone: null,
    email: null,
    birthday: null,
    dates: [],
  },
];

const PRODUCTS: Product[] = [
  { shop: "SH1", barcode: "8901058000290", brand: "Maggi", name: "2-Minute Masala Noodles", qty: "70 g", category: "instant_noodles", mrp: 14, stock: 60, daysLeft: 9 },
  { shop: "SH1", barcode: "8901719123870", brand: "Parle", name: "Parle-G Biscuits", qty: "250 g", category: "biscuits_cookies", mrp: 25, stock: 30, daysLeft: 12 },
  { shop: "SH1", barcode: "8901063093522", brand: "Britannia", name: "Good Day Cashew Cookies", qty: "52.5 g", category: "biscuits_cookies", mrp: 10, stock: 80, daysLeft: 8 },
  { shop: "SH1", barcode: "8901491361026", brand: "Kurkure", name: "Masala Munch", qty: "41.5 g", category: "chips_namkeen", mrp: 10, stock: 50, daysLeft: 8 },
  { shop: "SH1", barcode: "8906017290033", brand: "Bisleri", name: "Packaged Drinking Water", qty: "500 ml", category: "water_bottle", mrp: 10, stock: 100, daysLeft: 20 },
  { shop: "SH1", barcode: "8901262152211", brand: "Amul", name: "Kool Kesar Milk", qty: "180 ml", category: "tetra_milk", mrp: 25, stock: 40, daysLeft: 10 },
  { shop: "SH2", barcode: "8909081005251", brand: "Sunfeast", name: "Yippee Noodles", qty: "72.6 g", category: "instant_noodles", mrp: 15, stock: 50, daysLeft: 10 },
  { shop: "SH2", barcode: "8902579001360", brand: "Parle Agro", name: "Frooti Mango Drink", qty: "125 ml", category: "packaged_juice", mrp: 10, stock: 90, daysLeft: 9 },
  { shop: "SH2", barcode: "8901719105913", brand: "Parle", name: "Hide & Seek Choco Chip Cookies", qty: "120 g", category: "biscuits_cookies", mrp: 35, stock: 25, daysLeft: 11 },
  { shop: "SH2", barcode: "8901764175091", brand: "Maaza", name: "Mango Drink", qty: "135 ml", category: "packaged_juice", mrp: 10, stock: 60, daysLeft: 13 },
  { shop: "SH2", barcode: "8901491100519", brand: "Kurkure", name: "Masala Munch", qty: "78 g", category: "chips_namkeen", mrp: 20, stock: 40, daysLeft: 14 },
  { shop: "SH2", barcode: "8906017290040", brand: "Bisleri", name: "Packaged Drinking Water", qty: "1 litre", category: "water_bottle", mrp: 20, stock: 30, daysLeft: 18 },
];

const UA = { "User-Agent": "AnnaSetu-hackathon/0.1 (demo seed)" };

/** Front-of-pack photo from Open Food Facts as a data URL (null if it can't be fetched). */
async function photoFor(barcode: string): Promise<string | null> {
  try {
    const info = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=image_front_url`, { headers: UA });
    const url = ((await info.json()) as { product?: { image_front_url?: string } }).product?.image_front_url;
    if (!url) return null;
    const img = await fetch(url, { headers: UA });
    if (!img.ok) return null;
    const bytes = Buffer.from(await img.arrayBuffer());
    return `data:${img.headers.get("content-type") ?? "image/jpeg"};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function main() {
  const store = await import("../lib/store");
  console.log(`Seeding demo shops into ${store.storageMode() === "supabase" ? "Supabase" : ".data/ (local files)"}`);
  for (const s of SHOPS) await store.saveProfile(s);

  // Take the old demo items off the list (orders that point at them stay valid).
  for (const s of SHOPS)
    for (const old of await store.listShopItems(s.id))
      if (old.status !== "removed") await store.updateItem(old.id, { status: "removed" });

  const today = todayIST();
  for (const p of PRODUCTS) {
    const shop = SHOPS.find((s) => s.id === p.shop)!;
    const photo = await photoFor(p.barcode);
    const item: Omit<ItemRecord, "id" | "created_at"> = {
      shop_id: shop.id,
      shop_name: shop.shop_name!,
      shop_area: shop.area,
      product_name: p.name,
      brand: p.brand,
      net_quantity: p.qty,
      category: p.category,
      mrp: p.mrp,
      mfg_date: null,
      expiry_date: addDays(today, p.daysLeft),
      stock: p.stock,
      photo,
      voice_note: null,
      voice_id: null,
      status: "active",
    };
    await store.addItem(item);
    console.log(`  ${shop.id}  ${p.brand} ${p.name} ${p.qty}  stock ${p.stock}  expires ${item.expiry_date}  ${photo ? "photo ok" : "no photo"}`);
  }
  console.log("Done. Open /donate and generate a plan (donor area HSR Layout, BTM Layout, Koramangala or Jayanagar).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
