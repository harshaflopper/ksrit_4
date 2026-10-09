// GET /api/shop/voice?id=...&shop_id=...  -> the saved voice recording (audio file), for playback on My shop
import { fail, json } from "@/lib/api";
import { getVoice } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const shopId = q.get("shop_id");
  if (!id || !shopId) return json({ message: "Missing voice note." }, 400);
  try {
    const voice = await getVoice(id, shopId);
    const m = voice && /^data:(audio\/[\w.+-]+)(?:;[^,]*)?;base64,(.*)$/.exec(voice.audio);
    if (!m) return json({ message: "Voice note not found." }, 404);
    return new Response(Buffer.from(m[2], "base64"), {
      headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=86400" },
    });
  } catch (err) {
    return fail(err);
  }
}
