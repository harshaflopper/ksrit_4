// Runs the real POST /api/shop/items handler against a fake Gemini server and a throwaway
// .data folder: voice-note stock and expiry, the "still months from expiry" rejection, and
// the voice-transcription fallback.
// Run: npm test
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { addDays, todayIST } from "../lib/dates";

let reply: object = {};
let lastParts: { text?: string; inlineData?: { mimeType: string } }[] = [];
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    lastParts = JSON.parse(raw).contents[0].parts;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
  });
});

const SHOP = "shop_test";
const PHOTOS = ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"];
const today = todayIST();
const maggi = { isFood: true, isPackaged: true, productName: "Masala Noodles", brand: "Maggi", category: "instant_noodles", mrp: 14, packCondition: "sealed" };

type Post = (req: Request) => Promise<Response>;
let POST: Post;
async function add(body: object) {
  const res = await POST(new Request("http://x/api/shop/items", { method: "POST", body: JSON.stringify({ shop_id: SHOP, ...body }) }));
  return res.json();
}

before(async () => {
  process.chdir(mkdtempSync(path.join(tmpdir(), "annasetu-")));
  await new Promise<void>((r) => server.listen(0, r));
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/models`;
  process.env.GEMINI_API_KEY = "k";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { saveProfile } = await import("../lib/store");
  await saveProfile({ id: SHOP, role: "shop", name: "Ganesh", area: "Jayanagar", email: null, phone: null, shop_name: "Ganesh Stores", birthday: null, dates: [], address: null, lat: null, lng: null });
  POST = (await import("../app/api/shop/items/route")).POST;
});
after(() => server.close());

test("voice note gives stock and expiry, item is added; same pack again merges", async () => {
  const expiry = addDays(today, 10);
  reply = { ...maggi, expiryDate: expiry, dateConfidence: 0.5, expiryFromVoice: true, stock: 24 };
  const r = await add({ images: PHOTOS, note: `24 packets, expiry ${expiry}`, photo: PHOTOS[0] });
  assert.equal(lastParts.length, 3, "prompt + front + back");
  assert.match(lastParts[0].text!, /24 packets/);
  assert.equal(r.status, "added", JSON.stringify(r));
  assert.equal(r.item.stock, 24);
  assert.equal(r.item.expiry_date, expiry);

  reply = { ...maggi, expiryDate: expiry, dateConfidence: 0.9, expiryFromVoice: false, stock: 6 };
  const again = await add({ images: PHOTOS, note: "6 more" });
  assert.equal(again.merged, true);
  assert.equal(again.item.stock, 30);
});

test("pack still 3-4 months from expiry is rejected (said in the voice note)", async () => {
  for (const days of [90, 120]) {
    reply = { ...maggi, expiryDate: addDays(today, days), dateConfidence: 0.95, expiryFromVoice: true, stock: 10 };
    const r = await add({ images: PHOTOS, note: "10 packets" });
    assert.equal(r.status, "rejected", `${days} days: ${JSON.stringify(r)}`);
    assert.match(r.reasons.join(" "), /months/);
  }
});

test("unsure far-off printed date is asked about, then rejected once confirmed", async () => {
  const far = addDays(today, 110);
  reply = { ...maggi, expiryDate: far, dateConfidence: 0.5, expiryFromVoice: false, stock: 10 };
  const first = await add({ images: PHOTOS, note: "10 packets" });
  assert.equal(first.status, "needs");
  assert.deepEqual(first.needs, ["expiry"]);

  const confirmed = await add({ reading: first.reading, expiry: far });
  assert.equal(confirmed.status, "rejected");
  assert.match(confirmed.reasons.join(" "), /about 3 months/);
});

test("expiry worked out from 'best before 4 months' is rejected once confirmed", async () => {
  reply = { ...maggi, expiryDate: null, mfgDate: today, bestBeforeMonths: 4, dateConfidence: 0.9, expiryFromVoice: false, stock: 5 };
  const first = await add({ images: PHOTOS, note: "5 packets" });
  assert.equal(first.status, "needs");
  assert.equal(first.reading.expiryComputed, true);
  const confirmed = await add({ reading: first.reading, expiry: first.reading.expiryDate });
  assert.equal(confirmed.status, "rejected");
});

test("voice recording is sent to Gemini with the photos, then saved with the item and playable", async () => {
  const expiry = addDays(today, 12);
  const audio = `data:audio/wav;base64,${Buffer.from("RIFF-fake-wav").toString("base64")}`;
  reply = { ...maggi, productName: "Yippee Noodles", brand: "Sunfeast", expiryDate: expiry, dateConfidence: 0.4, expiryFromVoice: true, stock: 18, voiceTranscript: "18 packets, expiry date is coming" };
  const r = await add({ images: PHOTOS, audio, note: "" });
  assert.equal(lastParts.length, 4, "prompt + front + back + voice recording");
  assert.equal(lastParts[3].inlineData!.mimeType, "audio/wav");
  assert.match(lastParts[0].text!, /LAST attachment is the shopkeeper's voice recording/);
  assert.equal(r.status, "added", JSON.stringify(r));
  assert.equal(r.item.stock, 18, "stock from the voice note");
  assert.equal(r.item.expiry_date, expiry, "expiry from the voice note");
  assert.equal(r.item.voice_note, "18 packets, expiry date is coming");
  assert.ok(r.item.voice_id, "recording linked to the item");

  const { GET } = await import("../app/api/shop/voice/route");
  const play = await GET(new Request(`http://x/api/shop/voice?id=${r.item.voice_id}&shop_id=${SHOP}`));
  assert.equal(play.status, 200);
  assert.equal(play.headers.get("content-type"), "audio/wav");
  assert.equal(Buffer.from(await play.arrayBuffer()).toString(), "RIFF-fake-wav");
  const other = await GET(new Request(`http://x/api/shop/voice?id=${r.item.voice_id}&shop_id=someone_else`));
  assert.equal(other.status, 404, "another shop can't play it");
});

test("voice recording kept through the follow-up question", async () => {
  const audio = "data:audio/wav;base64,QUJD";
  reply = { ...maggi, productName: "Good Day", category: "biscuits_cookies", expiryDate: addDays(today, 9), dateConfidence: 0.9, expiryFromVoice: false, stock: null, voiceTranscript: "expiry next week" };
  const first = await add({ images: PHOTOS, audio });
  assert.equal(first.status, "needs");
  assert.deepEqual(first.needs, ["stock"]);
  const done = await add({ reading: first.reading, audio, stock: 7 });
  assert.equal(done.status, "added");
  assert.equal(done.item.stock, 7);
  assert.ok(done.item.voice_id);
  assert.equal(done.item.voice_note, "expiry next week");
});

test("voice fallback: recorded audio goes to Gemini and comes back as text", async () => {
  const { transcribe } = await import("../lib/gemini");
  reply = { text: "  24 packets, expiry 20 October  " };
  const t = await transcribe("data:audio/webm;base64,AAAA");
  assert.equal(t, "24 packets, expiry 20 October");
  assert.equal(lastParts[1].inlineData!.mimeType, "audio/webm");
  await assert.rejects(transcribe("data:text/plain;base64,AAAA"));
});

test("browser voice notes are converted to a valid 16 kHz mono WAV", async () => {
  const { encodeWav } = await import("../lib/audio");
  const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]));
  const v = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(wav.subarray(8, 12)), "WAVE");
  assert.equal(v.getUint16(22, true), 1); // mono
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(40, true), 10); // 5 samples x 2 bytes
  assert.equal(wav.length, 54);
  assert.equal(v.getInt16(50, true), 32767);
  assert.equal(v.getInt16(52, true), -32768);
});

test("transcription passes the chosen language to Gemini", async () => {
  const { transcribe } = await import("../lib/gemini");
  reply = { text: "24 packet" };
  await transcribe("data:audio/wav;base64,AAAA", "kn-IN");
  assert.match(lastParts[0].text!, /picked Kannada/);
});
