// POST /api/transcribe { audio: dataURL } -> { text }
// Only used when the browser has no built-in speech recognition (e.g. Firefox).
import { fail, json, readBody } from "@/lib/api";
import { transcribe } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await readBody(req);
  const audio = b?.audio;
  if (typeof audio !== "string" || !audio.startsWith("data:audio/") || audio.length > 8_000_000)
    return json({ message: "Send a short voice note." }, 400);
  try {
    return json({ text: await transcribe(audio, typeof b?.lang === "string" ? b.lang : undefined) });
  } catch (err) {
    return fail(err);
  }
}
