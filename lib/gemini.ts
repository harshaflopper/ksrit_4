// All Gemini calls (REST, no SDK). Gemini READS photos, voice and text and suggests
// kits. Plain code still decides safety, price, stock and what can be sold.

import "server-only";
import { CATEGORY_IDS, isCategoryId, type CategoryId } from "./categories";
import { addMonths, isISODate, todayIST } from "./dates";

// Overridable only so tests can point at a fake server.
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 45_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    public code: "no_key" | "rate_limited" | "failed" | "bad_output",
  ) {
    super(message);
  }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export function dataUrlPart(dataUrl: string): Part {
  const m = /^data:((?:image|audio)\/[\w.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new GeminiError("Unsupported photo or audio format.", "failed");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

async function callGemini<T>(parts: Part[], schema: object): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set in .env.local.", "no_key");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new GeminiError(timedOut ? "Gemini took too long." : "Couldn't reach Gemini.", "failed");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new GeminiError("Gemini's free quota is used up for now.", "rate_limited");
  if (!res.ok) {
    console.error("Gemini error", res.status, (await res.text().catch(() => "")).slice(0, 400));
    throw new GeminiError(`Gemini returned an error (${res.status}).`, "failed");
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  if (!text) throw new GeminiError("Gemini didn't return an answer.", "bad_output");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError("Gemini's answer couldn't be understood.", "bad_output");
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/* ---------------- Voice to text (fallback when the browser has no speech recognition) ---------------- */

const LANGUAGE: Record<string, string> = { "en-IN": "English", "kn-IN": "Kannada", "hi-IN": "Hindi" };

export async function transcribe(audioDataUrl: string, lang?: string): Promise<string> {
  const hint = lang && LANGUAGE[lang] ? ` The speaker picked ${LANGUAGE[lang]}, but may mix languages.` : "";
  const out = await callGemini<{ text?: string }>(
    [
      {
        text: `Transcribe this voice note exactly, in the language spoken (English, Kannada, Hindi or a mix).${hint} It is usually a kirana shopkeeper giving a pack count, expiry date and price, or a donor describing a plan. Write numbers and dates as digits. If there is no speech, return an empty text. Return only the transcript.`,
      },
      dataUrlPart(audioDataUrl),
    ],
    { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] },
  );
  return str(out.text) ?? "";
}

/* ---------------- Shop: read a product from 2 photos + what the shopkeeper said ---------------- */

export interface ItemReading {
  isFood: boolean;
  isPackaged: boolean;
  productName: string;
  brand: string | null;
  netQuantity: string | null;
  category: CategoryId;
  mrp: number | null;
  mfgDate: string | null;
  expiryDate: string | null;
  expiryComputed: boolean;
  dateConfidence: number;
  /** The shopkeeper said the expiry date (or confirmed it) in the voice note. */
  expiryFromVoice: boolean;
  stock: number | null;
  packCondition: "sealed" | "opened" | "damaged" | "unclear";
  notes: string | null;
  /** What Gemini heard in the shopkeeper's recorded voice note, in their words. */
  voiceTranscript: string | null;
}

const ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    isFood: { type: "BOOLEAN" },
    isPackaged: { type: "BOOLEAN", description: "factory-sealed retail pack with a printed label" },
    productName: { type: "STRING" },
    brand: { type: "STRING", nullable: true },
    netQuantity: { type: "STRING", nullable: true, description: "e.g. '70 g', '200 ml', 'pack of 12'" },
    category: { type: "STRING", enum: CATEGORY_IDS },
    mrp: { type: "NUMBER", nullable: true, description: "MRP in rupees per pack" },
    mfgDate: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
    expiryDate: { type: "STRING", nullable: true, description: "YYYY-MM-DD; the shopkeeper's spoken date wins if given" },
    bestBeforeMonths: { type: "NUMBER", nullable: true },
    dateConfidence: { type: "NUMBER", description: "0-1 confidence in expiryDate" },
    expiryFromVoice: { type: "BOOLEAN", description: "true if the shopkeeper said or confirmed the expiry date" },
    stock: { type: "NUMBER", nullable: true, description: "number of packs the shopkeeper said they have" },
    packCondition: { type: "STRING", enum: ["sealed", "opened", "damaged", "unclear"] },
    notes: { type: "STRING", nullable: true },
    voiceTranscript: { type: "STRING", nullable: true, description: "word-for-word transcript of the attached voice recording; null if there is no recording or no speech" },
  },
  required: ["isFood", "isPackaged", "productName", "category", "dateConfidence", "expiryFromVoice", "packCondition"],
};

export function normalizeReading(raw: Record<string, unknown>): ItemReading {
  const mfgDate = isISODate(raw.mfgDate) ? raw.mfgDate : null;
  let expiryDate = isISODate(raw.expiryDate) ? raw.expiryDate : null;
  let expiryComputed = false;
  const months = num(raw.bestBeforeMonths);
  if (!expiryDate && mfgDate && months && months > 0 && months <= 60) {
    expiryDate = addMonths(mfgDate, Math.round(months));
    expiryComputed = true;
  }
  const mrp = num(raw.mrp);
  const stock = num(raw.stock);
  const conf = num(raw.dateConfidence) ?? 0;
  const pack = raw.packCondition;
  return {
    isFood: raw.isFood !== false,
    isPackaged: raw.isPackaged !== false,
    productName: str(raw.productName) ?? "",
    brand: str(raw.brand),
    netQuantity: str(raw.netQuantity),
    category: isCategoryId(raw.category) ? raw.category : "other_packaged_snack",
    mrp: mrp && mrp > 0 ? Math.round(mrp * 100) / 100 : null,
    mfgDate,
    expiryDate,
    expiryComputed,
    dateConfidence: Math.min(1, Math.max(0, conf)),
    expiryFromVoice: raw.expiryFromVoice === true,
    stock: stock && stock > 0 ? Math.min(999, Math.round(stock)) : null,
    packCondition: pack === "sealed" || pack === "opened" || pack === "damaged" ? pack : "unclear",
    notes: str(raw.notes),
    voiceTranscript: str(raw.voiceTranscript),
  };
}

/** Reads the pack photos together with the shopkeeper's voice recording (audio, listened to by
 *  Gemini directly) and/or typed note. */
export async function readItem(images: string[], typedNote: string, voiceAudio?: string | null): Promise<ItemReading> {
  const today = todayIST();
  const prompt = `You help a kirana shopkeeper in India add a near-expiry packaged product to their inventory. Today is ${today}.
Photos: the front and the back of ONE product pack.
${voiceAudio ? "The LAST attachment is the shopkeeper's voice recording (Kannada, Hindi, English or a mix). Listen to it: it usually says how many packs they have and the expiry date, sometimes the MRP. Put a word-for-word transcript in voiceTranscript.\n" : ""}The shopkeeper also typed (may be empty): """${typedNote.slice(0, 600)}"""

Rules:
- Read only what is printed or said. Never invent a number or date.
- Indian dates are day-first: 05/11/26 is 5 November 2026. MFD/PKD = manufacture. EXP / Use by / Best before + date = expiry.
- If the shopkeeper says an expiry date ("expiry 25th October", "expires next Friday"), use it as expiryDate and set expiryFromVoice true. If they say the printed date is correct, also set expiryFromVoice true.
- If only "best before N months from manufacture" is printed, set expiryDate null and bestBeforeMonths N.
- Dot-printed dates are easy to misread; if unsure, dateConfidence below 0.8.
- What the shopkeeper says (recording or typed) wins over the photo for stock, expiry and MRP.
- stock = number of packs the shopkeeper says they have ("12 packets", "ondu dozen" = 12, "baarah" = 12). Null if not said.
- MRP is per pack, the rupee amount after "MRP".
- Category: Maggi/Yippee = instant_noodles; Lays/Kurkure/namkeen = chips_namkeen; Frooti/Maaza/Real = packaged_juice; Bisleri = water_bottle; rice, atta, dal, oil = staples; curd, paneer, milk pouches = fresh_dairy; soap or toiletries = non_food.`;
  const parts = [{ text: prompt }, ...images.map(dataUrlPart), ...(voiceAudio ? [dataUrlPart(voiceAudio)] : [])];
  const raw = await callGemini<Record<string, unknown>>(parts, ITEM_SCHEMA);
  return normalizeReading(raw);
}

/* ---------------- Donor: understand what they want ---------------- */

export interface DonorRequest {
  dates: string[];
  occasion: string | null;
  people: number | null;
  budget: number | null;
  area: string | null;
}

export async function parseDonorRequest(text: string, areas: string[]): Promise<DonorRequest> {
  const today = todayIST();
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
  const raw = await callGemini<Record<string, unknown>>(
    [
      {
        text: `A donor in Bengaluru describes a food donation they want to make. Today is ${weekday}, ${today}.
They said (may be Kannada, Hindi or English): """${text.slice(0, 800)}"""
Extract:
- dates: every date they want to donate on, as YYYY-MM-DD. Resolve "this Sunday", "next Friday", "on the 20th", "my birthday on 3rd November". Future dates only.
- occasion: short phrase like "Amma's birthday", or null.
- people: how many people they want to feed, or null.
- budget: rupees, or null.
- area: one of ${areas.join(", ")}, closest match to where they are or want to donate, or null.`,
      },
    ],
    {
      type: "OBJECT",
      properties: {
        dates: { type: "ARRAY", items: { type: "STRING" } },
        occasion: { type: "STRING", nullable: true },
        people: { type: "NUMBER", nullable: true },
        budget: { type: "NUMBER", nullable: true },
        area: { type: "STRING", nullable: true },
      },
      required: ["dates"],
    },
  );
  const dates = Array.isArray(raw.dates) ? raw.dates.filter((d): d is string => isISODate(d) && d >= today) : [];
  const people = num(raw.people);
  const budget = num(raw.budget);
  const area = str(raw.area);
  return {
    dates: [...new Set(dates)].sort(),
    occasion: str(raw.occasion),
    people: people && people > 0 ? Math.min(2000, Math.round(people)) : null,
    budget: budget && budget > 0 ? Math.round(budget) : null,
    area: area && areas.includes(area) ? area : null,
  };
}

/* ---------------- Donor: AI kit combinations from nearby stock ---------------- */

export interface KitIdea {
  title: string;
  /** 1-2 sentences: why this combination is good for this donor. */
  summary: string;
  perPerson: { itemId: string; qty: number }[];
  servingIdea: string;
}

export interface KitSuggestions {
  /** One line recommending a kit by title ("Maggi and Frooti feeds the most..."). */
  summary: string;
  kits: KitIdea[];
}

export async function suggestKits(
  candidates: { id: string; name: string; kind: string; shop: string; km: number; price: number; mrp: number; stock: number; expiry: string }[],
  req: { date: string; people: number; budget: number | null; occasion: string | null },
): Promise<KitSuggestions> {
  const raw = await callGemini<{ kits?: unknown; summary?: unknown }>(
    [
      {
        text: `You plan food donation kits for a donor in Bengaluru. Each kit is what ONE person receives.
Donation date ${req.date}, ${req.people} people${req.budget ? `, budget ₹${req.budget} in total` : ""}${req.occasion ? `, occasion: ${req.occasion}` : ""}.
These are the sealed packaged items in stock right now at shops near the donor (live from the shops' inventory; price is per pack, today's discounted price):
${candidates.map((c) => `- id=${c.id} | ${c.name} | ${c.kind} | ₹${c.price} (MRP ₹${c.mrp}) | stock ${c.stock} | expires ${c.expiry} | ${c.shop}, ${c.km} km`).join("\n")}

Make up to 3 different kits:
- Combine items that go together: something filling (noodles, ready-to-eat, biscuits, chips, cake) plus a drink (juice, water, flavoured milk). Example: Maggi + water bottle; chips + juice; cake + milkshake.
- Prefer items from ONE shop, at most two shops, so the donor travels less.
- Cost per person x people should fit the budget if possible, and stock must cover qty x people. If it can't, say how many people it does feed.
- qty per person is 1 or 2.
- summary: 1-2 plain sentences for the donor on why this kit is a good pick (filling, kids like it, cheapest, one stop, feeds the most). Use real numbers from the list. No emojis.
- servingIdea: 1-2 plain sentences on how to serve it. If noodles are included, give a simple bulk cooking method for the group (packs per litre of water, batch size). No emojis.
- title: 2-5 words, like "Maggi and Frooti".
Top-level summary: one sentence that recommends one kit BY ITS TITLE and says why (for example most people fed within budget, or fewest stops).
Use only ids from the list.`,
      },
    ],
    {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        kits: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              summary: { type: "STRING" },
              perPerson: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: { itemId: { type: "STRING" }, qty: { type: "NUMBER" } },
                  required: ["itemId", "qty"],
                },
              },
              servingIdea: { type: "STRING" },
            },
            required: ["title", "summary", "perPerson", "servingIdea"],
          },
        },
      },
      required: ["summary", "kits"],
    },
  );
  const kits = !Array.isArray(raw.kits)
    ? []
    : raw.kits
        .map((k) => {
          const kit = k as Record<string, unknown>;
          const lines = Array.isArray(kit.perPerson) ? kit.perPerson : [];
          return {
            title: str(kit.title) ?? "Donation kit",
            summary: str(kit.summary) ?? "",
            servingIdea: str(kit.servingIdea) ?? "",
            perPerson: lines
              .map((l) => l as Record<string, unknown>)
              .filter((l) => typeof l.itemId === "string")
              .map((l) => ({ itemId: l.itemId as string, qty: Math.min(2, Math.max(1, Math.round(num(l.qty) ?? 1))) })),
          };
        })
        .filter((k) => k.perPerson.length > 0)
        .slice(0, 3);
  return { summary: str(raw.summary) ?? "", kits };
}
