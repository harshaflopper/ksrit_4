"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FamilyDates, datesFromFamily, familyFromDates, type FamilyForm } from "@/components/FamilyDates";
import { ProfileSetup } from "@/components/ProfileSetup";
import { VoiceInput } from "@/components/VoiceInput";
import { Avatar, Card, Spinner, btnPrimary, btnQuiet, field } from "@/components/ui";
import { addDays, formatDay, todayIST } from "@/lib/dates";
import { mapsEmbed } from "@/lib/geo";
import { upcomingOccasions, type Upcoming } from "@/lib/occasions";
import type { Kit, KitLine, KitShop } from "@/lib/planner";
import { loadProfile, saveMyProfile } from "@/lib/session";
import type { Order, Profile } from "@/lib/types";

/** Packs are listed up to 30 days before expiry, so plans only work for dates within that. */
const PLAN_WINDOW_DAYS = 30;

interface Plan {
  date: string;
  occasion: string;
  people: string;
  budget: string;
}

interface PlanResult {
  kits: Kit[];
  summary: string;
  ai: boolean;
  message?: string;
  donor: { lat: number; lng: number; exact: boolean };
}

export default function DonatePage() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    loadProfile("donor").then(setProfile).catch(() => setProfile(null));
  }, []);

  return (
    <main className="mx-auto max-w-[640px] space-y-4 px-4 py-5">
      {profile === undefined ? (
        <p className="flex justify-center py-16 text-mute">
          <Spinner />
        </p>
      ) : profile === null ? (
        <ProfileSetup role="donor" onDone={setProfile} />
      ) : (
        <DonorHome profile={profile} onProfile={setProfile} />
      )}
      <p className="pt-2 text-center text-[13px] text-mute">
        Demo shop product photos:{" "}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">
          Open Food Facts
        </a>
        , CC BY-SA 3.0.
      </p>
    </main>
  );
}

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** Donation date for an occasion: the day itself if plans can reach it, else 3 days from now. */
function donationDateFor(o: Upcoming): string {
  return o.daysAway <= PLAN_WINDOW_DAYS ? o.date : addDays(todayIST(), 3);
}

function DonorHome({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const occasions = useMemo(() => upcomingOccasions(profile.dates, profile.birthday), [profile.dates, profile.birthday]);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<number>(0);
  const [plan, setPlan] = useState<Plan>(() => {
    const o = occasions[0];
    return { date: o ? donationDateFor(o) : addDays(todayIST(), 3), occasion: o?.label ?? "", people: "30", budget: "" };
  });
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [chosen, setChosen] = useState<Kit | null>(null);
  const [paid, setPaid] = useState<{ orders: Order[]; kit: Kit } | null>(null);
  const [busy, setBusy] = useState<"parse" | "plan" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [said, setSaid] = useState("");
  const [mapOf, setMapOf] = useState<{ line: KitLine; shop: KitShop } | null>(null);

  const loadOrders = useCallback(async () => {
    const res = await fetch(`/api/donor/orders?donor_id=${encodeURIComponent(profile.id)}`, { cache: "no-store" });
    if (res.ok) setOrders((await res.json()).orders);
  }, [profile.id]);
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function pick(i: number) {
    const o = occasions[i];
    setPicked(i);
    setPlan((p) => ({ ...p, date: donationDateFor(o), occasion: o.label }));
    setResult(null);
    setChosen(null);
  }

  function locate() {
    if (!navigator.geolocation) return setError("This browser can't share location, so your area is used.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location, so your area is used.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function generate(p: Plan = plan) {
    setBusy("plan");
    setError(null);
    setResult(null);
    setChosen(null);
    setPaid(null);
    try {
      const res = await fetch("/api/donor/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: profile.area,
          ...(spot ?? {}),
          date: p.date,
          people: Number(p.people) || 30,
          budget: Number(p.budget) || null,
          occasion: p.occasion || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data as PlanResult);
    } catch (err) {
      setError((err as Error).message || "Couldn't make a plan. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function understand() {
    setBusy("parse");
    setError(null);
    try {
      const res = await fetch("/api/donor/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: said }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const r = data.request;
      const next: Plan = {
        date: r.dates[0] ?? plan.date,
        occasion: r.occasion ?? "",
        people: r.people ? String(r.people) : plan.people,
        budget: r.budget ? String(r.budget) : plan.budget,
      };
      setPicked(-1);
      setPlan(next);
      await generate(next);
    } catch (err) {
      setError((err as Error).message || "Couldn't understand that. Fill in the details instead.");
      setBusy(null);
    }
  }

  const selected = picked >= 0 ? occasions[picked] : null;
  const tooFar = selected ? selected.daysAway > PLAN_WINDOW_DAYS : false;

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={profile.name} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-bold leading-tight">Hi {profile.name.split(" ")[0]}</h1>
          <p className="text-mute">{profile.area}</p>
        </div>
        <button type="button" onClick={() => setEditing((e) => !e)} className="font-semibold text-leaf hover:underline">
          {editing ? "Close" : "Family dates"}
        </button>
      </div>

      {editing || occasions.length === 0 ? (
        <EditDates
          profile={profile}
          onSaved={(p) => {
            onProfile(p);
            setEditing(false);
            setPicked(0);
            const o = upcomingOccasions(p.dates, p.birthday)[0];
            if (o) setPlan((x) => ({ ...x, date: donationDateFor(o), occasion: o.label }));
          }}
        />
      ) : null}

      {paid ? (
        <Paid paid={paid} onDone={() => setPaid(null)} />
      ) : chosen ? (
        <Checkout
          kit={chosen}
          plan={plan}
          donorId={profile.id}
          onBack={() => setChosen(null)}
          onPaid={(o) => {
            setPaid({ orders: o, kit: chosen });
            setChosen(null);
            setResult(null);
            loadOrders();
          }}
          onMap={setMapOf}
        />
      ) : (
        <>
          {occasions.length > 0 ? (
            <Card>
              <h2 className="font-display text-[20px] font-bold">Coming up</h2>
              <ul className="mt-2 space-y-2">
                {occasions.map((o, i) => (
                  <li key={`${o.label}-${o.date}`}>
                    <button
                      type="button"
                      onClick={() => pick(i)}
                      aria-pressed={i === picked}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                        i === picked ? "border-leaf bg-leaf-soft" : "border-line hover:bg-page"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{o.label}</span>
                        <span className="block text-[14.5px] text-mute">
                          {weekday(o.date)}, {formatDay(o.date)}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[14.5px] font-semibold ${o.daysAway <= 7 ? "text-chilli" : "text-mute"}`}>
                        {inDays(o.daysAway)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h2 className="font-display text-[20px] font-bold">
              {plan.occasion ? `Donate for ${plan.occasion.replace(/^My /, "your ")}` : "Plan a donation"}
            </h2>
            {tooFar && selected ? (
              <p className="mt-1 text-[15px] text-mute">
                {selected.label} is {inDays(selected.daysAway)}. Packs listed today expire before then, so donate on a nearer day
                in its name, or come back from {formatDay(addDays(selected.date, -PLAN_WINDOW_DAYS))}.
              </p>
            ) : null}
            <form
              className="mt-3 grid grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                generate();
              }}
            >
              <label className="block">
                <span className="mb-1 block text-[14.5px] font-semibold">Amount ₹</span>
                <input
                  className={field}
                  inputMode="numeric"
                  value={plan.budget}
                  placeholder="2000"
                  onChange={(e) => setPlan({ ...plan, budget: e.target.value.replace(/\D/g, "") })}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[14.5px] font-semibold">People to feed</span>
                <input
                  className={field}
                  inputMode="numeric"
                  value={plan.people}
                  onChange={(e) => setPlan({ ...plan, people: e.target.value.replace(/\D/g, "") })}
                />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1 block text-[14.5px] font-semibold">Donation day</span>
                <input
                  type="date"
                  className={field}
                  value={plan.date}
                  min={todayIST()}
                  onChange={(e) => setPlan({ ...plan, date: e.target.value })}
                />
              </label>
              <div className="col-span-2 flex flex-wrap items-center gap-2 text-[14.5px] text-mute">
                <span>{spot ? "Shops near your current location" : `Shops near ${profile.area}`}</span>
                <button type="button" onClick={locate} disabled={locating} className="font-semibold text-leaf hover:underline">
                  {locating ? "Finding you" : spot ? "Update location" : "Use my location"}
                </button>
              </div>
              <button type="submit" disabled={busy !== null || !plan.budget} className={`${btnPrimary} col-span-2 py-3 text-[17px]`}>
                {busy === "plan" ? (
                  <>
                    <Spinner /> Checking shops near you and planning
                  </>
                ) : (
                  "Generate plan"
                )}
              </button>
            </form>
          </Card>

          <details className="rounded-xl border border-line bg-card p-4">
            <summary className="cursor-pointer font-semibold">Or say your plan in your own words</summary>
            <div className="mt-3">
              <VoiceInput
                label="Your plan"
                value={said}
                onChange={setSaid}
                placeholder="For example: feed 50 children this Sunday for my mother's birthday, around 2000 rupees"
              />
              <button type="button" onClick={understand} disabled={!said.trim() || busy !== null} className={`${btnQuiet} mt-3 w-full`}>
                {busy === "parse" ? (
                  <>
                    <Spinner /> Understanding your plan
                  </>
                ) : (
                  "Plan this"
                )}
              </button>
            </div>
          </details>

          {error ? <p className="rounded-xl bg-turmeric-soft p-3 text-turmeric-ink">{error}</p> : null}
          {result?.message ? <p className="rounded-xl bg-turmeric-soft p-3 text-turmeric-ink">{result.message}</p> : null}

          {result && result.kits.length > 0 ? (
            <>
              <Card className="border-leaf">
                <p className="text-[14px] font-semibold uppercase tracking-wide text-leaf">
                  {result.ai ? "AI plan from live stock" : "Plan from live stock"}
                </p>
                <p className="mt-1 text-[17px]">
                  {result.summary ||
                    `${result.kits.length} ${result.kits.length === 1 ? "combination" : "combinations"} from shops near you for ${formatDay(plan.date)}.`}
                </p>
              </Card>
              {result.kits.map((k, i) => (
                <KitCard
                  key={`${k.title}-${i}`}
                  kit={k}
                  budget={Number(plan.budget) || null}
                  onChoose={() => setChosen(k)}
                  onMap={setMapOf}
                />
              ))}
              {!result.ai ? <p className="text-center text-[13.5px] text-mute">Suggested from stock rules (AI suggestions are off).</p> : null}
            </>
          ) : null}
        </>
      )}

      {orders.length > 0 && !chosen ? (
        <Card>
          <h2 className="font-display text-[20px] font-bold">Your donations</h2>
          <ul className="mt-2 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="py-2.5">
                <p className="font-semibold">
                  {formatDay(o.donation_date)}
                  {o.occasion ? `, ${o.occasion}` : ""}
                </p>
                <p className="text-[15px] text-mute">
                  {o.people} people, {o.shop_name}, ₹{o.total}, {o.status === "paid" ? "ready for pickup" : "picked up"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {mapOf ? <MapSheet line={mapOf.line} shop={mapOf.shop} onClose={() => setMapOf(null)} /> : null}
    </>
  );
}

function EditDates({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [family, setFamily] = useState<FamilyForm>(() => familyFromDates(profile.dates, profile.birthday));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const p = profile;
      onSaved(
        await saveMyProfile("donor", {
          name: p.name,
          area: p.area,
          email: p.email,
          phone: p.phone,
          shop_name: null,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          birthday: family.birthday || null,
          dates: datesFromFamily(family, p.dates),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-[20px] font-bold">Your family&apos;s dates</h2>
      <p className="mb-3 text-mute">We show the nearest one first, so you can plan a donation for it in two taps.</p>
      <FamilyDates value={family} onChange={setFamily} />
      {error ? <p className="mt-2 text-chilli">{error}</p> : null}
      <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} mt-4 w-full`}>
        {saving ? "Saving" : "Save dates"}
      </button>
    </Card>
  );
}

function shopOf(kit: Kit, line: KitLine): KitShop {
  return kit.shops.find((s) => s.id === line.shopId) ?? kit.shops[0];
}

function ItemRow({ line, kit, onMap, people }: { line: KitLine; kit: Kit; onMap: (m: { line: KitLine; shop: KitShop }) => void; people?: number }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onMap({ line, shop: shopOf(kit, line) })}
        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-card"
        title="Show the shop on the map"
      >
        {line.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.photo} alt="" className="h-12 w-12 shrink-0 rounded-md bg-card object-contain" />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-md bg-card" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {people ? `${line.qty * people} x ` : `${line.qty} x `}
            {line.productName}
            {line.netQuantity ? <span className="font-normal text-mute"> {line.netQuantity}</span> : null}
          </span>
          <span className="block text-[14px] text-mute">
            {line.shopName}, {line.km} km. Good till {formatDay(line.expiryDate)}
          </span>
        </span>
        <span className="shrink-0 text-right text-[15px]">
          ₹{line.price} <s className="text-mute">₹{line.mrp}</s>
        </span>
      </button>
    </li>
  );
}

function ShopLinks({ shop }: { shop: KitShop }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
      <div className="min-w-0">
        <p className="font-semibold">{shop.name}</p>
        <p className="text-[14px] text-mute">
          {shop.address ? `${shop.address}, ` : ""}
          {shop.area}. About {shop.km} km
        </p>
      </div>
      <div className="flex gap-3 text-[14.5px] font-semibold">
        <a href={shop.mapUrl} target="_blank" rel="noreferrer" className="text-leaf hover:underline">
          Map
        </a>
        <a href={shop.directionsUrl} target="_blank" rel="noreferrer" className="text-leaf hover:underline">
          Directions
        </a>
      </div>
    </div>
  );
}

function KitCard({
  kit,
  budget,
  onChoose,
  onMap,
}: {
  kit: Kit;
  budget: number | null;
  onChoose: () => void;
  onMap: (m: { line: KitLine; shop: KitShop }) => void;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-line bg-card p-4">
      <div>
        <h3 className="font-display text-[22px] font-bold leading-tight">{kit.title}</h3>
        {kit.summary ? <p className="mt-1">{kit.summary}</p> : null}
      </div>
      <div className="rounded-lg bg-page p-2">
        <p className="px-1.5 text-[14.5px] text-mute">Each person gets (tap one to see the shop on the map)</p>
        <ul className="mt-1">
          {kit.perPerson.map((l) => (
            <ItemRow key={l.itemId} line={l} kit={kit} onMap={onMap} />
          ))}
        </ul>
      </div>
      <div>
        <p className="font-display text-[28px] font-bold leading-none">Feeds {kit.people} people</p>
        <p className="mt-1 text-mute">
          ₹{kit.costPerPerson} per person, ₹{kit.total} in total
          {budget && kit.normalPeople !== null ? `. At full price, ₹${budget} would feed ${kit.normalPeople}.` : "."}
        </p>
      </div>
      <div className="space-y-2">
        {kit.shops.map((s) => (
          <ShopLinks key={s.id} shop={s} />
        ))}
      </div>
      {kit.servingIdea ? (
        <p className="border-l-[3px] border-turmeric pl-3 text-[15px]">
          <span className="font-semibold">How to serve: </span>
          {kit.servingIdea}
        </p>
      ) : null}
      <button type="button" onClick={onChoose} className={`${btnPrimary} w-full py-3`}>
        Choose this, ₹{kit.total}
      </button>
    </article>
  );
}

function Checkout({
  kit,
  plan,
  donorId,
  onBack,
  onPaid,
  onMap,
}: {
  kit: Kit;
  plan: Plan;
  donorId: string;
  onBack: () => void;
  onPaid: (orders: Order[]) => void;
  onMap: (m: { line: KitLine; shop: KitShop }) => void;
}) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/donor/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donor_id: donorId,
          date: plan.date,
          occasion: plan.occasion || null,
          people: kit.people,
          perPerson: kit.perPerson.map((l) => ({ itemId: l.itemId, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.problems ?? [data.message]).join(" "));
      onPaid(data.orders);
    } catch (err) {
      setError((err as Error).message);
      setPaying(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <button type="button" onClick={onBack} className="font-semibold text-leaf hover:underline">
          Back to plans
        </button>
        <h2 className="mt-1 font-display text-[24px] font-bold leading-tight">Confirm your donation</h2>
        <p className="text-mute">
          {kit.title} for {kit.people} people{plan.occasion ? `, ${plan.occasion}` : ""}, on {weekday(plan.date)} {formatDay(plan.date)}.
        </p>
      </div>
      {kit.shops.map((s) => {
        const lines = kit.perPerson.filter((l) => l.shopId === s.id);
        const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty * kit.people, 0);
        return (
          <section key={s.id} className="space-y-2">
            <ShopLinks shop={s} />
            <ul className="rounded-lg bg-page p-1">
              {lines.map((l) => (
                <ItemRow key={l.itemId} line={l} kit={kit} onMap={onMap} people={kit.people} />
              ))}
            </ul>
            <p className="text-right font-semibold">Pay {s.name}: ₹{subtotal}</p>
          </section>
        );
      })}
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="font-semibold">Total</span>
        <span className="font-display text-[28px] font-bold">₹{kit.total}</span>
      </div>
      <p className="text-[14.5px] text-mute">
        The packs are taken out of the shop&apos;s stock now and set aside for you. Pick them up before {formatDay(plan.date)} and
        hand them out yourself.
      </p>
      {error ? <p className="text-chilli">{error}</p> : null}
      <button type="button" onClick={pay} disabled={paying} className={`${btnPrimary} w-full py-3 text-[17px]`}>
        {paying ? <Spinner /> : null} Proceed and pay by UPI (demo)
      </button>
    </Card>
  );
}

function Paid({ paid, onDone }: { paid: { orders: Order[]; kit: Kit }; onDone: () => void }) {
  return (
    <Card className="space-y-3 border-leaf bg-leaf-soft">
      <p className="font-display text-[22px] font-bold">Paid. The shops have set your packs aside.</p>
      {paid.orders.map((o) => {
        const shop = paid.kit.shops.find((s) => s.id === o.shop_id);
        return (
          <div key={o.id} className="space-y-2 rounded-lg bg-card p-3">
            <p>
              Pick up {o.lines.map((l) => `${l.qty} ${l.product_name}`).join(" and ")} from {o.shop_name} before{" "}
              {formatDay(o.donation_date)}. You paid ₹{o.total}.
            </p>
            {shop ? <ShopLinks shop={shop} /> : null}
          </div>
        );
      })}
      <button type="button" onClick={onDone} className={btnQuiet}>
        Done
      </button>
    </Card>
  );
}

function MapSheet({ line, shop, onClose }: { line: KitLine; shop: KitShop; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${line.productName} at ${shop.name}`}
        className="w-full max-w-[640px] rounded-t-2xl bg-card p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {line.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={line.photo} alt="" className="h-16 w-16 shrink-0 rounded-md bg-page object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-display text-[20px] font-bold leading-tight">{line.productName}</p>
            <p className="text-mute">
              {shop.name}, {shop.address ? `${shop.address}, ` : ""}
              {shop.area}. About {shop.km} km from you
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-mute hover:bg-page" aria-label="Close map">
            Close
          </button>
        </div>
        <iframe
          title={`Map of ${shop.name}`}
          src={mapsEmbed({ lat: shop.lat, lng: shop.lng })}
          className="mt-3 h-[300px] w-full rounded-lg border border-line"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={shop.mapUrl} target="_blank" rel="noreferrer" className={btnQuiet}>
            Open in Google Maps
          </a>
          <a href={shop.directionsUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
            Directions
          </a>
        </div>
      </div>
    </div>
  );
}
