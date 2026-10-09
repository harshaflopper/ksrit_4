// GET /api/me?id=...  -> { profile }      POST /api/me { profile } -> { profile }
// id is a random id stored on the phone for now; it becomes the Clerk user id later.
import { fail, json, readBody, text } from "@/lib/api";
import { isISODate } from "@/lib/dates";
import { getProfile, saveProfile } from "@/lib/store";
import { isPoint } from "@/lib/geo";
import { AREA_NAMES, type SavedDate } from "@/lib/types";

const KINDS = ["self", "anniversary", "child", "other"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ message: "Missing id." }, 400);
  try {
    return json({ profile: await getProfile(id) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  const b = await readBody(req);
  const id = text(b?.id, 80);
  const role = b?.role === "shop" || b?.role === "donor" ? b.role : null;
  const name = text(b?.name, 80);
  const area = text(b?.area, 40);
  if (!id || !role || !name || !area || !AREA_NAMES.includes(area))
    return json({ message: "Add your name and pick your area." }, 400);
  if (role === "shop" && !text(b?.shop_name, 80)) return json({ message: "Add your shop name." }, 400);
  const dates: SavedDate[] = Array.isArray(b?.dates)
    ? (b!.dates as SavedDate[])
        .filter((d) => d && isISODate(d.date) && typeof d.label === "string" && d.label.trim())
        .slice(0, 50)
        .map((d) => ({
          label: d.label.trim().slice(0, 60),
          date: d.date,
          ...(KINDS.includes(d.kind as (typeof KINDS)[number]) ? { kind: d.kind } : {}),
        }))
    : [];
  const located = isPoint(b?.lat, b?.lng);
  try {
    const profile = await saveProfile({
      id,
      role,
      name,
      area,
      email: text(b?.email, 120),
      phone: text(b?.phone, 20),
      shop_name: role === "shop" ? text(b?.shop_name, 80) : null,
      birthday: isISODate(b?.birthday) ? (b!.birthday as string) : null,
      dates,
      address: text(b?.address, 160),
      lat: located ? (b!.lat as number) : null,
      lng: located ? (b!.lng as number) : null,
    });
    return json({ profile });
  } catch (err) {
    return fail(err);
  }
}
