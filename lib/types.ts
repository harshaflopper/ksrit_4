import type { Pricing } from "./pricing";

export type Role = "shop" | "donor";

export interface SavedDate {
  label: string; // "My birthday", "Riya's birthday", "Our anniversary"
  date: string; // YYYY-MM-DD (the year is ignored for yearly occasions)
  kind?: "self" | "anniversary" | "child" | "other"; // missing on dates saved before kinds existed
}

/** One row per signed-in user (id = Clerk user id). */
export interface Profile {
  id: string;
  created_at: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  area: string;
  shop_name: string | null; // shops only
  birthday: string | null; // donors only
  dates: SavedDate[]; // donors: occasions they gave on or want reminding about
  address: string | null; // shops: street address shown to donors
  lat: number | null; // shops: exact location (donors: last known, optional)
  lng: number | null;
}

/** A shop's inventory row. Price is NOT stored; it's computed daily from expiry_date. */
export interface ItemRecord {
  id: string;
  created_at: string;
  shop_id: string;
  shop_name: string;
  shop_area: string;
  product_name: string;
  brand: string | null;
  net_quantity: string | null;
  category: string;
  mrp: number;
  mfg_date: string | null;
  expiry_date: string;
  stock: number;
  photo: string | null;
  voice_note: string | null; // what the shopkeeper said, as Gemini heard it (or typed)
  voice_id: string | null; // latest recorded voice note (VoiceNote row), for playback
  status: "active" | "sold_out" | "removed";
}

/** A shopkeeper's recorded voice note (WAV data URL), kept apart so lists stay light. */
export interface VoiceNote {
  id: string;
  created_at: string;
  shop_id: string;
  item_id: string;
  transcript: string | null;
  audio: string;
}

export interface Deal extends ItemRecord {
  pricing: Pricing;
}

export interface OrderLine {
  item_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  mrp: number;
}

/** A donor's paid purchase from one shop. A plan across two shops makes two orders. */
export interface Order {
  id: string;
  created_at: string;
  donor_id: string;
  donor_name: string;
  shop_id: string;
  shop_name: string;
  shop_area: string;
  donation_date: string;
  occasion: string | null;
  people: number;
  lines: OrderLine[];
  total: number;
  status: "paid" | "handed_over";
}

export const BENGALURU_AREAS: Record<string, [number, number]> = {
  Banashankari: [12.925, 77.546],
  Basavanagudi: [12.942, 77.575],
  "BTM Layout": [12.916, 77.61],
  "HSR Layout": [12.912, 77.638],
  Indiranagar: [12.978, 77.64],
  Jayanagar: [12.925, 77.593],
  "JP Nagar": [12.906, 77.585],
  Koramangala: [12.935, 77.624],
  Malleshwaram: [13.003, 77.57],
  Rajajinagar: [12.991, 77.554],
  "RR Nagar": [12.927, 77.519],
  Vijayanagar: [12.971, 77.536],
  Whitefield: [12.97, 77.75],
  Yelahanka: [13.1, 77.596],
};

export const AREA_NAMES = Object.keys(BENGALURU_AREAS);

/** Straight-line km between two areas (haversine). Unknown areas count as far away. */
export function distanceKm(a: string, b: string): number {
  const p = BENGALURU_AREAS[a];
  const q = BENGALURU_AREAS[b];
  if (!p || !q) return a === b ? 0 : 99;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(q[0] - p[0]);
  const dLng = rad(q[1] - p[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}
