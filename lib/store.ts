// All database access. Supabase (PostgREST over fetch) when SUPABASE_URL + key are set,
// otherwise JSON files in .data/ so the app runs with zero setup.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ItemRecord, Order, Profile, VoiceNote } from "./types";

type Table = "profiles" | "items" | "orders" | "voices";
type Row = { id: string; created_at: string };

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** Setup problem the person running the app has to fix (shown as is, not as "something went wrong"). */
export class SetupError extends Error {}

export function storageMode() {
  return supabase() ? "supabase" : "local";
}

async function sb(pathAndQuery: string, init: RequestInit = {}) {
  const s = supabase()!;
  const res = await fetch(`${s.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: s.key,
      Authorization: `Bearer ${s.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (body.includes("PGRST205")) throw new SetupError("The database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor.");
    if (body.includes("PGRST204") || body.includes("42703"))
      throw new SetupError("The database is missing new columns. Run supabase/schema.sql again in the Supabase SQL Editor (it only adds what's missing).");
    throw new Error(`Supabase ${res.status}: ${body}`);
  }
  return res.json();
}

const file = (t: Table) => path.join(process.cwd(), ".data", `${t}.json`);

async function readAll<T extends Row>(t: Table): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(file(t), "utf8")) as T[];
  } catch {
    return [];
  }
}

async function writeAll<T extends Row>(t: Table, rows: T[]) {
  await fs.mkdir(path.dirname(file(t)), { recursive: true });
  await fs.writeFile(file(t), JSON.stringify(rows, null, 2));
}

/** Equality filters only, newest first. */
async function select<T extends Row>(t: Table, where: Partial<Record<keyof T, string>> = {}): Promise<T[]> {
  if (supabase()) {
    const q = Object.entries(where)
      .map(([k, v]) => `${k}=eq.${encodeURIComponent(String(v))}`)
      .join("&");
    return sb(`${t}?select=*${q ? `&${q}` : ""}&order=created_at.desc&limit=500`);
  }
  const rows = await readAll<T>(t);
  return rows
    .filter((r) => Object.entries(where).every(([k, v]) => String((r as Record<string, unknown>)[k]) === v))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function insert<T extends Row>(t: Table, row: Omit<T, "id" | "created_at"> & Partial<Row>): Promise<T> {
  if (supabase()) return ((await sb(t, { method: "POST", body: JSON.stringify(row) })) as T[])[0];
  const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row } as T;
  const rows = await readAll<T>(t);
  rows.push(full);
  await writeAll(t, rows);
  return full;
}

async function update<T extends Row>(t: Table, id: string, patch: Partial<T>): Promise<T> {
  if (supabase()) return ((await sb(`${t}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) })) as T[])[0];
  const rows = await readAll<T>(t);
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) throw new Error(`${t} ${id} not found`);
  rows[i] = { ...rows[i], ...patch };
  await writeAll(t, rows);
  return rows[i];
}

/* ---------- profiles ---------- */

export async function getProfile(id: string) {
  return (await select<Profile>("profiles", { id }))[0] ?? null;
}

export const listShops = () => select<Profile>("profiles", { role: "shop" });

export async function saveProfile(p: Omit<Profile, "created_at">): Promise<Profile> {
  const existing = await getProfile(p.id);
  if (existing) return update<Profile>("profiles", p.id, p);
  return insert<Profile>("profiles", p);
}

/* ---------- inventory ---------- */

export const listActiveItems = () => select<ItemRecord>("items", { status: "active" });
export const listShopItems = (shopId: string) => select<ItemRecord>("items", { shop_id: shopId });
export const addItem = (item: Omit<ItemRecord, "id" | "created_at">) => insert<ItemRecord>("items", item);
export const updateItem = (id: string, patch: Partial<ItemRecord>) => update<ItemRecord>("items", id, patch);

/* ---------- voice notes ---------- */

export const addVoice = (v: Omit<VoiceNote, "id" | "created_at">) => insert<VoiceNote>("voices", v);
export async function getVoice(id: string, shopId: string) {
  return (await select<VoiceNote>("voices", { id, shop_id: shopId }))[0] ?? null;
}

/* ---------- orders ---------- */

export const listShopOrders = (shopId: string) => select<Order>("orders", { shop_id: shopId });
export const listDonorOrders = (donorId: string) => select<Order>("orders", { donor_id: donorId });
export const addOrder = (o: Omit<Order, "id" | "created_at">) => insert<Order>("orders", o);
export const updateOrder = (id: string, patch: Partial<Order>) => update<Order>("orders", id, patch);
