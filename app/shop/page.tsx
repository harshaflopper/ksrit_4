"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PackCamera } from "@/components/PackCamera";
import type { Photo } from "@/components/PhotoBox";
import { ProfileSetup } from "@/components/ProfileSetup";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Avatar, Card, Spinner, btnPrimary, btnQuiet, btnSecondary, field } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import type { Pricing } from "@/lib/pricing";
import { loadProfile } from "@/lib/session";
import type { ItemRecord, Order, Profile } from "@/lib/types";

type Item = ItemRecord & { pricing: Pricing };
type Need = "expiry" | "stock" | "mrp";
type Reading = Record<string, unknown> & { productName?: string; voiceTranscript?: string | null; expiryDate?: string | null; stock?: number | null; mrp?: number | null };
type Result =
  | { status: "added"; item: Item; merged: boolean }
  | { status: "needs"; needs: Need[]; reading: Reading }
  | { status: "rejected"; reasons: string[]; reading: Reading };

export default function ShopPage() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    loadProfile("shop").then(setProfile).catch(() => setProfile(null));
  }, []);

  return (
    <main className="mx-auto max-w-[720px] space-y-6 px-4 py-6 sm:py-8">
      {profile === undefined ? (
        <div className="space-y-6" aria-hidden>
          <div className="flex items-center gap-3">
            <span className="skeleton h-14 w-14 rounded-full" />
            <span className="flex-1 space-y-2">
              <span className="skeleton block h-5 w-1/2" />
              <span className="skeleton block h-3.5 w-1/4" />
            </span>
          </div>
          <span className="skeleton block h-80 w-full rounded-card" />
          <span className="skeleton block h-40 w-full rounded-card" />
        </div>
      ) : profile === null ? (
        <ProfileSetup role="shop" onDone={setProfile} />
      ) : (
        <ShopHome profile={profile} />
      )}
    </main>
  );
}

function ShopHome({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/shop/items?shop_id=${encodeURIComponent(profile.id)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items);
    setOrders(data.orders);
  }, [profile.id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000); // new paid orders show up without reloading
    return () => clearInterval(t);
  }, [refresh]);

  async function handOver(orderId: string) {
    await fetch("/api/shop/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop_id: profile.id, order_id: orderId }),
    });
    refresh();
  }

  const newOrders = orders.filter((o) => o.status === "paid");
  const active = items.filter((i) => i.status === "active" && i.stock > 0);

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={profile.shop_name ?? profile.name} size={56} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[28px] font-bold leading-tight text-leaf-deep sm:text-[32px]">{profile.shop_name}</h1>
          <p className="text-mute">{profile.area}</p>
        </div>
      </div>

      {newOrders.length > 0 ? (
        <section className="space-y-3" aria-label="Paid orders">
          {newOrders.map((o) => (
            <Card key={o.id} className="relative overflow-hidden border-leaf-200 bg-gradient-to-br from-leaf-soft to-white pl-6">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-leaf" />
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-turmeric ring-4 ring-turmeric-soft" />
                <div className="min-w-0 flex-1">
                  <p className="nums font-display text-[20px] font-bold leading-snug text-leaf-deep">
                    {o.donor_name} paid ₹{o.total}
                  </p>
                  <p className="nums mt-1 text-[15px] leading-relaxed">
                    {o.lines.map((l) => `${l.qty} ${l.product_name}`).join(", ")}. Donation on {formatDay(o.donation_date)}
                    {o.occasion ? ` for ${o.occasion}` : ""}. Keep these packs aside for pickup.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => handOver(o.id)} className={`${btnPrimary} mt-4 w-full py-3 text-[17px] sm:w-auto`}>
                Handed over
              </button>
            </Card>
          ))}
        </section>
      ) : null}

      <AddItem shopId={profile.id} onAdded={refresh} />

      <Card>
        <h2 className="font-display text-[22px] font-bold">Your near-expiry stock</h2>
        {active.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-line bg-leaf-50 px-4 py-8 text-center">
            <p className="text-mute">Nothing listed yet. Add a pack above and it shows up for donors nearby.</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {active.map((i) => (
              <li key={i.id} className="flex items-center gap-4 py-4">
                {i.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-leaf-50 object-cover ring-1 ring-line" />
                ) : (
                  <span className="h-16 w-16 shrink-0 rounded-xl bg-leaf-50 ring-1 ring-line" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{[i.brand, i.product_name].filter(Boolean).join(" ")}</p>
                  <p
                    className={`nums mt-1 inline-block rounded-full px-2.5 py-0.5 text-[13.5px] font-semibold ${
                      i.pricing.daysLeft <= 1
                        ? "bg-chilli-soft text-chilli"
                        : i.pricing.daysLeft <= 7
                          ? "bg-turmeric-soft text-turmeric-ink"
                          : "bg-leaf-soft text-leaf-dark"
                    }`}
                  >
                    Expires {formatDay(i.expiry_date)}, {i.pricing.daysLeft} {i.pricing.daysLeft === 1 ? "day" : "days"} left
                  </p>
                  {i.voice_id ? (
                    <div>
                      <PlayVoice src={`/api/shop/voice?id=${i.voice_id}&shop_id=${encodeURIComponent(profile.id)}`} note={i.voice_note} />
                    </div>
                  ) : null}
                </div>
                <div className="nums shrink-0 text-right">
                  <p className="font-display text-[20px] font-bold leading-tight">{i.stock} left</p>
                  <p className="text-[14.5px] text-mute">₹{i.pricing.price ?? "-"} each</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {orders.some((o) => o.status === "handed_over") ? (
        <Card>
          <h2 className="font-display text-[22px] font-bold">Handed over</h2>
          <ul className="nums mt-2 divide-y divide-line text-[15px] text-mute [&>li]:py-2">
            {orders
              .filter((o) => o.status === "handed_over")
              .map((o) => (
                <li key={o.id}>
                  {o.donor_name}, ₹{o.total}, {formatDay(o.donation_date)}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function AddItem({ shopId, onAdded }: { shopId: string; onAdded: () => void }) {
  const [front, setFront] = useState<Photo | null>(null);
  const [back, setBack] = useState<Photo | null>(null);
  const [note, setNote] = useState("");
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [expiry, setExpiry] = useState("");
  const [stock, setStock] = useState("");
  const [mrp, setMrp] = useState("");

  function reset() {
    setFront(null);
    setBack(null);
    setNote("");
    setAudio(null);
    setResult(null);
    setError(null);
    setExpiry("");
    setStock("");
    setMrp("");
  }

  async function send(extra: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: shopId, note, audio, photo: front?.thumb ?? null, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data as Result);
      if (data.status === "needs") {
        setExpiry(data.reading.expiryDate ?? "");
        setStock(data.reading.stock ? String(data.reading.stock) : "");
        setMrp(data.reading.mrp ? String(data.reading.mrp) : "");
      }
      if (data.status === "added") onAdded();
    } catch (err) {
      setError(
        (err as Error).message.includes("GEMINI_API_KEY")
          ? "Photo reading isn't switched on yet. Add GEMINI_API_KEY to .env.local."
          : (err as Error).message || "Couldn't add the item. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (result?.status === "added") {
    const i = result.item;
    return (
      <Card className="border-leaf-200 bg-gradient-to-br from-leaf-soft to-white">
        <p className="font-display text-[24px] font-bold text-leaf-deep">{result.merged ? "Stock updated" : "Added to your stock"}</p>
        <p className="nums mt-2 leading-relaxed">
          {i.stock} packs of {[i.brand, i.product_name].filter(Boolean).join(" ")}. Expires {formatDay(i.expiry_date)},{" "}
          {i.pricing.daysLeft} days from today. Donors pay ₹{i.pricing.price} each today (MRP ₹{i.mrp}), less each day after.
        </p>
        {i.voice_id ? (
          <>
            <Heard text={i.voice_note} />
            <p className="mt-1 text-[15px] text-mute">Your voice note is saved with this item.</p>
          </>
        ) : null}
        <button type="button" onClick={reset} className={`${btnPrimary} mt-5 w-full sm:w-auto`}>
          Add next item
        </button>
      </Card>
    );
  }

  if (result?.status === "rejected") {
    return (
      <Card className="border-chilli/30 bg-chilli-soft">
        <p className="font-display text-[20px] font-bold text-chilli">{result.reading.productName || "This item"} can&apos;t be listed</p>
        <Heard text={result.reading.voiceTranscript} />
        <ul className="mt-3 list-disc space-y-1 pl-5 leading-relaxed">
          {result.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <button type="button" onClick={reset} className={`${btnSecondary} mt-5`}>
          Try another item
        </button>
      </Card>
    );
  }

  if (result?.status === "needs") {
    const r = result.reading;
    const ready = (!result.needs.includes("expiry") || expiry) && (!result.needs.includes("stock") || Number(stock) >= 1) && (!result.needs.includes("mrp") || Number(mrp) > 0);
    return (
      <Card>
        <p className="font-display text-[22px] font-bold leading-snug">One more thing for {r.productName || "this item"}</p>
        <Heard text={r.voiceTranscript} />
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            send({ reading: r, expiry: expiry || undefined, stock: Number(stock) || undefined, mrp: Number(mrp) || undefined });
          }}
        >
          {result.needs.includes("expiry") ? (
            <label className="block">
              <span className="mb-1.5 block font-semibold">
                {r.expiryDate ? "Is this the expiry date on the pack?" : "Expiry date on the pack"}
              </span>
              <input type="date" className={field} value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
            </label>
          ) : null}
          {result.needs.includes("stock") ? (
            <label className="block">
              <span className="mb-1.5 block font-semibold">How many packs do you have?</span>
              <input className={field} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} required />
            </label>
          ) : null}
          {result.needs.includes("mrp") ? (
            <label className="block">
              <span className="mb-1.5 block font-semibold">MRP of one pack (₹)</span>
              <input className={field} inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value.replace(/[^\d.]/g, ""))} required />
            </label>
          ) : null}
          {error ? <p className="text-chilli">{error}</p> : null}
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="submit" disabled={!ready || busy} className={btnPrimary}>
              {busy ? <Spinner /> : null} Add to stock
            </button>
            <button type="button" onClick={reset} className={btnQuiet}>
              Start over
            </button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-display text-[24px] font-bold leading-tight">Add a near-expiry item</h2>
      <p className="mb-5 mt-1 text-mute">Take a photo of the front of the pack, then the back, then say how many you have.</p>
      <PackCamera front={front} back={back} onFront={setFront} onBack={setBack} />
      <div className="mt-6 border-t border-line pt-6">
        <VoiceRecorder audio={audio} onAudio={setAudio} />
        <label className="mt-5 block">
          <span className="mb-1.5 block text-[14.5px] font-semibold text-mute">Or type it</span>
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="24 packets, expiry 20 October" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-xl bg-chilli-soft px-4 py-3 text-chilli">{error}</p> : null}
      <button
        type="button"
        disabled={!front || busy}
        onClick={() => send({ images: [front!.full, ...(back ? [back.full] : [])] })}
        className={`${btnPrimary} mt-6 min-h-13 w-full py-3.5 text-[17px]`}
      >
        {busy ? (
          <>
            <Spinner /> {audio ? "Reading the pack and listening to your voice note" : "Reading the pack"}
          </>
        ) : (
          "Add to stock"
        )}
      </button>
    </Card>
  );
}

function Heard({ text }: { text?: string | null }) {
  return text ? <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[15px] text-mute ring-1 ring-line">Heard in your voice note: &ldquo;{text}&rdquo;</p> : null;
}

function PlayVoice({ src, note }: { src: string; note: string | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  function toggle() {
    if (!ref.current) {
      ref.current = new Audio(src);
      ref.current.onended = () => setPlaying(false);
    }
    if (playing) {
      ref.current.pause();
      setPlaying(false);
    } else {
      ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }
  useEffect(() => () => ref.current?.pause(), []);
  return (
    <button type="button" onClick={toggle} title={note ?? undefined} className="mt-1.5 inline-flex min-h-8 items-center rounded-full bg-leaf-50 px-3 text-[14px] font-semibold text-leaf ring-1 ring-leaf-200 transition-colors duration-200 hover:bg-leaf-soft">
      {playing ? "Stop voice note" : "Play voice note"}
    </button>
  );
}
