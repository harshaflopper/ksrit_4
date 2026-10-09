// Checks Gemini request shapes and how replies are cleaned up, with a fake Gemini server,
// plus the kit planner's stock and budget checks.
// Run: npm test   (tsx runs with --conditions react-server so "server-only" loads)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { areaPoint } from "../lib/geo";
import { buildKit, candidatesFor, fallbackIdeas } from "../lib/planner";
import type { ItemRecord } from "../lib/types";

let lastBody: { url?: string; json: { contents: { parts: { text?: string; inlineData?: { mimeType: string } }[] }[] } } | null = null;
let reply: object = {};
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    lastBody = { url: req.url, json: JSON.parse(raw) };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
  });
});

test("shop: photos + voice note -> reading", async () => {
  await new Promise<void>((r) => server.listen(0, r));
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/models`;
  process.env.GEMINI_API_KEY = "k";
  process.env.GEMINI_MODEL = "m";
  const { readItem, parseDonorRequest } = await import("../lib/gemini");

  reply = { isFood: true, isPackaged: true, productName: "Masala Noodles", brand: "Maggi", category: "instant_noodles", mrp: 14, mfgDate: "2026-04-20", expiryDate: "2026-10-20", dateConfidence: 0.5, expiryFromVoice: true, stock: 24, packCondition: "sealed" };
  const r = await readItem(["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"], "24 packets, expiry 20 October");
  assert.equal(lastBody!.url, "/models/m:generateContent");
  assert.equal(lastBody!.json.contents[0].parts.length, 3);
  assert.match(lastBody!.json.contents[0].parts[0].text!, /24 packets, expiry 20 October/);
  assert.equal(r.stock, 24);
  assert.equal(r.expiryFromVoice, true);

  reply = { dates: ["2026-10-11", "2020-01-01", "bad"], occasion: "Amma's birthday", people: 50, budget: 2000, area: "Jayanagar" };
  const d = await parseDonorRequest("feed 50 kids this Sunday", ["Jayanagar", "BTM Layout"]);
  assert.deepEqual(d.dates, ["2026-10-11"].filter((x) => x >= new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)));
  assert.equal(d.people, 50);
  assert.equal(d.area, "Jayanagar");
  server.close();
});

const item = (o: Partial<ItemRecord>): ItemRecord => ({
  id: "x", created_at: "2026-10-09T00:00:00Z", shop_id: "s1", shop_name: "Ganesh", shop_area: "Jayanagar",
  product_name: "Maggi", brand: null, net_quantity: null, category: "instant_noodles", mrp: 14, mfg_date: null,
  expiry_date: "2026-10-20", stock: 60, photo: null, voice_note: null, voice_id: null, status: "active", ...o,
});

test("planner: nearby, unexpired, stock and budget limits", () => {
  const items = [
    item({ id: "maggi" }),
    item({ id: "water", product_name: "Water 500 ml", category: "water_bottle", mrp: 10, stock: 40 }),
    item({ id: "early", expiry_date: "2026-10-12" }), // expires before donation
    item({ id: "far", shop_area: "Whitefield", shop_id: "s9" }),
  ];
  const c = candidatesFor(items, areaPoint("Jayanagar")!, "2026-10-15", new Map(), "2026-10-09");
  assert.deepEqual(c.map((x) => x.item.id).sort(), ["maggi", "water"]);
  const kit = buildKit({ title: "Maggi and water", servingIdea: "", perPerson: [{ itemId: "maggi", qty: 1 }, { itemId: "water", qty: 1 }] }, c, 100, null)!;
  assert.equal(kit.people, 40); // water stock limits it
  assert.ok(kit.servingIdea.includes("noodles"));
  const budgeted = buildKit({ title: "t", servingIdea: "s", perPerson: [{ itemId: "maggi", qty: 1 }] }, c, 100, 50)!;
  assert.equal(budgeted.people, Math.floor(50 / budgeted.costPerPerson));
  assert.ok(budgeted.normalPeople! < budgeted.people);
  assert.equal(fallbackIdeas(c).length, 1);
});
