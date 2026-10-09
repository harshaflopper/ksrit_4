"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PackCamera } from "@/components/PackCamera";
import type { Photo } from "@/components/PhotoBox";
import { ProfileSetup } from "@/components/ProfileSetup";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Avatar, Card, Spinner, btnPrimary, btnQuiet, field } from "@/components/ui";
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
    <main className="mx-auto max-w-[640px] space-y-4 px-4 py-5">
      {profile === undefined ? (
        <p className="flex justify-center py-16 text-mute">
          <Spinner />
        </p>
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
      <div className="flex items-center gap-3">
        <Avatar name={profile.shop_name ?? profile.name} size={48} />
        <div>
          <h1 className="font-display text-[24px] font-bold leading-tight">{profile.shop_name}</h1>
          <p className="text-mute">{profile.area}</p>
        </div>
      </div>

      {newOrders.length > 0 ? (
        <section className="space-y-3" aria-label="Paid orders">
          {newOrders.map((o) => (
            <Card key={o.id} className="border-leaf bg-leaf-soft">
              <p className="font-semibold">
                {o.donor_name} paid ₹{o.total}
              </p>
              <p className="text-[15px]">
                {o.lines.map((l) => `${l.qty} ${l.product_name}`).join(", ")}. Donation on {formatDay(o.donation_date)}
                {o.occasion ? ` for ${o.occasion}` : ""}. Keep these packs aside for pickup.
              </p>
              <button type="button" onClick={() => handOver(o.id)} className={`${btnPrimary} mt-3`}>
                Handed over
              </button>
            </Card>
          ))}
        </section>
      ) : null}

      <AddItem shopId={profile.id} onAdded={refresh} />

      <Card>
        <h2 className="font-display text-[20px] font-bold">Your near-expiry stock</h2>
        {active.length === 0 ? (
          <p className="mt-1 text-mute">Nothing listed yet. Add a pack above and it shows up for donors nearby.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {active.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                {i.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.photo} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-14 w-14 shrink-0 rounded-lg bg-page" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{[i.brand, i.product_name].filter(Boolean).join(" ")}</p>
                  <p className={`text-[14.5px] ${i.pricing.daysLeft <= 2 ? "text-chilli" : "text-mute"}`}>
                    Expires {formatDay(i.expiry_date)}, {i.pricing.daysLeft} {i.pricing.daysLeft === 1 ? "day" : "days"} left
                  </p>
                  {i.voice_id ? <PlayVoice src={`/api/shop/voice?id=${i.voice_id}&shop_id=${encodeURIComponent(profile.id)}`} note={i.voice_note} /> : null}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{i.stock} left</p>
                  <p className="text-[14.5px] text-mute">₹{i.pricing.price ?? "-"} each</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {orders.some((o) => o.status === "handed_over") ? (
        <Card>
          <h2 className="font-display text-[20px] font-bold">Handed over</h2>
          <ul className="mt-1 space-y-1 text-[15px] text-mute">
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
      <Card className="border-leaf">
        <p className="font-display text-[20px] font-bold">{result.merged ? "Stock updated" : "Added to your stock"}</p>
        <p className="mt-1">
          {i.stock} packs of {[i.brand, i.product_name].filter(Boolean).join(" ")}. Expires {formatDay(i.expiry_date)},{" "}
          {i.pricing.daysLeft} days from today. Donors pay ₹{i.pricing.price} each today (MRP ₹{i.mrp}), less each day after.
        </p>
        {i.voice_id ? (
          <>
            <Heard text={i.voice_note} />
            <p className="mt-1 text-[15px] text-mute">Your voice note is saved with this item.</p>
          </>
        ) : null}
        <button type="button" onClick={reset} className={`${btnPrimary} mt-3`}>
          Add next item
        </button>
      </Card>
    );
  }

  if (result?.status === "rejected") {
    return (
      <Card className="border-chilli/40 bg-chilli-soft">
        <p className="font-semibold text-chilli">{result.reading.productName || "This item"} can&apos;t be listed</p>
        <Heard text={result.reading.voiceTranscript} />
        <ul className="mt-1 list-disc pl-5">
          {result.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <button type="button" onClick={reset} className={`${btnQuiet} mt-3`}>
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
        <p className="font-display text-[20px] font-bold">One more thing for {r.productName || "this item"}</p>
        <Heard text={r.voiceTranscript} />
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send({ reading: r, expiry: expiry || undefined, stock: Number(stock) || undefined, mrp: Number(mrp) || undefined });
          }}
        >
          {result.needs.includes("expiry") ? (
            <label className="block">
              <span className="mb-1 block font-semibold">
                {r.expiryDate ? "Is this the expiry date on the pack?" : "Expiry date on the pack"}
              </span>
              <input type="date" className={field} value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
            </label>
          ) : null}
          {result.needs.includes("stock") ? (
            <label className="block">
              <span className="mb-1 block font-semibold">How many packs do you have?</span>
              <input className={field} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} required />
            </label>
          ) : null}
          {result.needs.includes("mrp") ? (
            <label className="block">
              <span className="mb-1 block font-semibold">MRP of one pack (₹)</span>
              <input className={field} inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value.replace(/[^\d.]/g, ""))} required />
            </label>
          ) : null}
          {error ? <p className="text-chilli">{error}</p> : null}
          <div className="flex gap-2">
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
      <h2 className="font-display text-[20px] font-bold">Add a near-expiry item</h2>
      <p className="mb-3 text-mute">Take a photo of the front of the pack, then the back, then say how many you have.</p>
      <PackCamera front={front} back={back} onFront={setFront} onBack={setBack} />
      <div className="mt-4">
        <VoiceRecorder audio={audio} onAudio={setAudio} />
        <label className="mt-3 block">
          <span className="mb-1 block text-[14.5px] text-mute">Or type it</span>
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="24 packets, expiry 20 October" />
        </label>
      </div>
      {error ? <p className="mt-3 text-chilli">{error}</p> : null}
      <button
        type="button"
        disabled={!front || busy}
        onClick={() => send({ images: [front!.full, ...(back ? [back.full] : [])] })}
        className={`${btnPrimary} mt-4 w-full py-3 text-[17px]`}
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
  return text ? <p className="mt-1 text-[15px] text-mute">Heard in your voice note: &ldquo;{text}&rdquo;</p> : null;
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
    <button type="button" onClick={toggle} title={note ?? undefined} className="mt-0.5 text-[14.5px] font-semibold text-leaf hover:underline">
      {playing ? "Stop voice note" : "Play voice note"}
    </button>
  );
}
