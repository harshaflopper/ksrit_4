// Donor flow: family occasions, distances and map links, and the real plan + order routes
// against a fake Gemini and a throwaway .data folder (seeded like SH1 / SH2).
// Run: npm test
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { addDays, todayIST } from "../lib/dates";
import { mapsDirections, mapsPin, roadKm, straightKm } from "../lib/geo";
import { nextOccurrence, upcomingOccasions } from "../lib/occasions";

test("occasions: next date, nearest first, 29 Feb, past donations left out", () => {
  const today = "2026-10-09";
  assert.equal(nextOccurrence("1990-10-18", today), "2026-10-18");
  assert.equal(nextOccurrence("1990-10-09", today), "2026-10-09"); // today counts
  assert.equal(nextOccurrence("1990-03-01", today), "2027-03-01");
  assert.equal(nextOccurrence("2016-02-29", today), "2027-02-28");
  const list = upcomingOccasions(
    [
      { label: "Our anniversary", date: "2015-12-02", kind: "anniversary" },
      { label: "Riya's birthday", date: "2018-10-20", kind: "child" },
      { label: "Donation", date: "2026-08-15" },
      { label: "Riya's birthday", date: "2026-10-20" }, // saved again by an order: same day, shown once
    ],
    "1990-10-18",
    today,
  );
  assert.deepEqual(
    list.map((o) => [o.label, o.date, o.daysAway]),
    [
      ["My birthday", "2026-10-18", 9],
      ["Riya's birthday", "2026-10-20", 11],
      ["Our anniversary", "2026-12-02", 54],
    ],
  );
});

test("distance and Google Maps links", () => {
  const sh1 = { lat: 12.925, lng: 77.5838 };
  const sh2 = { lat: 12.9166, lng: 77.6101 };
  const km = straightKm(sh1, sh2);
  assert.ok(km > 2.8 && km < 3.1, String(km));
  assert.equal(roadKm(sh1, sh2), Math.round(km * 1.3 * 10) / 10);
  assert.equal(mapsPin(sh1), "https://www.google.com/maps/search/?api=1&query=12.925000,77.583800");
  assert.equal(
    mapsDirections(sh2, sh1),
    "https://www.google.com/maps/dir/?api=1&origin=12.916600,77.610100&destination=12.925000,77.583800",
  );
});

/* ---------- plan + order routes ---------- */

let reply: object = {};
let lastPrompt = "";
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    lastPrompt = JSON.parse(raw).contents[0].parts[0].text;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
  });
});

type Handler = (req: Request) => Promise<Response>;
let plan: Handler;
let order: Handler;
const ids: Record<string, string> = {};
const today = todayIST();
const post = async (h: Handler, body: object) => {
  const res = await h(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

before(async () => {
  process.chdir(mkdtempSync(path.join(tmpdir(), "annasetu-donor-")));
  await new Promise<void>((r) => server.listen(0, r));
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/models`;
  process.env.GEMINI_API_KEY = "k";
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const store = await import("../lib/store");
  const shop = (id: string, name: string, area: string, lat: number, lng: number) =>
    store.saveProfile({ id, role: "shop", name, shop_name: name, area, address: `${name} street`, lat, lng, email: null, phone: null, birthday: null, dates: [] });
  await shop("SH1", "Sri Ganesh Stores", "Jayanagar", 12.925, 77.5838);
  await shop("SH2", "Lakshmi Provisions", "BTM Layout", 12.9166, 77.6101);
  await shop("FAR", "Far Away Mart", "Whitefield", 12.97, 77.75);
  await store.saveProfile({
    id: "donor_1",
    role: "donor",
    name: "Asha",
    area: "Jayanagar",
    email: null,
    phone: null,
    shop_name: null,
    birthday: "1990-10-18",
    dates: [{ label: "My birthday", date: "1990-10-18", kind: "self" }],
    address: null,
    lat: null,
    lng: null,
  });
  const add = async (key: string, shopId: string, shopName: string, area: string, name: string, category: string, mrp: number, stock: number, days: number) => {
    const it = await store.addItem({
      shop_id: shopId,
      shop_name: shopName,
      shop_area: area,
      product_name: name,
      brand: null,
      net_quantity: null,
      category,
      mrp,
      mfg_date: null,
      expiry_date: addDays(today, days),
      stock,
      photo: "data:image/jpeg;base64,AAAA",
      voice_note: null,
      voice_id: null,
      status: "active",
    });
    ids[key] = it.id;
  };
  await add("maggi", "SH1", "Sri Ganesh Stores", "Jayanagar", "Maggi Noodles", "instant_noodles", 14, 60, 9);
  await add("bisleri", "SH1", "Sri Ganesh Stores", "Jayanagar", "Bisleri Water", "water_bottle", 10, 100, 20);
  await add("frooti", "SH2", "Lakshmi Provisions", "BTM Layout", "Frooti", "packaged_juice", 10, 90, 7);
  await add("far", "FAR", "Far Away Mart", "Whitefield", "Lays", "chips_namkeen", 20, 50, 9);
  plan = (await import("../app/api/donor/plan/route")).POST;
  order = (await import("../app/api/donor/orders/route")).POST;
});
after(() => server.close());

test("plan: Gemini gets only real nearby stock, kits come back checked with summary, km and map links", async () => {
  reply = {
    summary: "Maggi and Frooti feeds all 30 within budget.",
    kits: [
      {
        title: "Maggi and Frooti",
        summary: "Filling noodles with a mango drink.",
        perPerson: [
          { itemId: ids.maggi, qty: 1 },
          { itemId: ids.frooti, qty: 1 },
        ],
        servingIdea: "Cook 10 packs per 1.5 litres.",
      },
      { title: "Made up", summary: "x", perPerson: [{ itemId: "not-a-real-item", qty: 1 }], servingIdea: "" },
    ],
  };
  const r = await post(plan, { area: "Jayanagar", date: addDays(today, 2), people: 30, budget: 2000, occasion: "My birthday" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(lastPrompt, /Maggi Noodles/);
  assert.match(lastPrompt, /Frooti/);
  assert.doesNotMatch(lastPrompt, /Lays/, "Whitefield shop is more than 6 km away");
  assert.equal(r.body.ai, true);
  assert.equal(r.body.summary, "Maggi and Frooti feeds all 30 within budget.");
  assert.equal(r.body.kits.length, 1, "the made-up item is dropped by code");
  const kit = r.body.kits[0];
  assert.equal(kit.summary, "Filling noodles with a mango drink.");
  assert.equal(kit.people, 30);
  assert.equal(kit.shops.length, 2);
  const sh1 = kit.shops.find((s: { id: string }) => s.id === "SH1");
  assert.equal(sh1.address, "Sri Ganesh Stores street");
  assert.ok(sh1.km > 0 && sh1.km < 6);
  assert.match(sh1.directionsUrl, /google\.com\/maps\/dir\/\?api=1&origin=.*&destination=12\.925000,77\.583800/);
  assert.match(kit.perPerson[0].mapUrl, /google\.com\/maps\/search/);
  assert.ok(kit.perPerson[0].photo);
});

test("plan: no shop within 6 km gives a clear message", async () => {
  const r = await post(plan, { area: "Yelahanka", date: addDays(today, 2), people: 10, budget: 500 });
  assert.equal(r.body.kits.length, 0);
  assert.match(r.body.message, /No shop within 6 km of you has packs listed. The nearest is about [0-9.]+ km away/);
});

test("plan: packs nearby that expire before the donation day are explained", async () => {
  const r = await post(plan, { area: "Jayanagar", date: addDays(today, 25), people: 10, budget: 500 });
  assert.equal(r.body.kits.length, 0);
  assert.match(r.body.message, /listed near you, but all expire by .*Pick a donation day before/);
});

test("order: stock is deducted per shop, and the same item twice can't oversell", async () => {
  const date = addDays(today, 2);
  const dup = await post(order, {
    donor_id: "donor_1",
    date,
    people: 40,
    perPerson: [
      { itemId: ids.maggi, qty: 1 },
      { itemId: ids.maggi, qty: 1 },
    ],
  });
  assert.equal(dup.status, 409, "80 Maggi wanted, 60 in stock");

  const ok = await post(order, {
    donor_id: "donor_1",
    date,
    occasion: "My birthday",
    people: 30,
    perPerson: [
      { itemId: ids.maggi, qty: 1 },
      { itemId: ids.frooti, qty: 1 },
    ],
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.orders.map((o: { shop_id: string }) => o.shop_id).sort(), ["SH1", "SH2"]);
  const store = await import("../lib/store");
  const left = new Map((await store.listActiveItems()).map((i) => [i.id, i.stock]));
  assert.equal(left.get(ids.maggi), 30);
  assert.equal(left.get(ids.frooti), 60);
  const donor = await store.getProfile("donor_1");
  assert.equal(donor!.dates.filter((d) => d.label === "My birthday").length, 1, "birthday not saved twice");
});
