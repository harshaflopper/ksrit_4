// POST /api/donor/parse { text } -> { request: { dates, occasion, people, budget, area } }
import { fail, json, readBody, text } from "@/lib/api";
import { parseDonorRequest } from "@/lib/gemini";
import { AREA_NAMES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const t = text((await readBody(req))?.text, 800);
  if (!t) return json({ message: "Say or type when you want to donate." }, 400);
  try {
    return json({ request: await parseDonorRequest(t, AREA_NAMES) });
  } catch (err) {
    return fail(err);
  }
}
