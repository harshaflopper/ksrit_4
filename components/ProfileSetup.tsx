"use client";

import { useState } from "react";
import { saveMyProfile } from "@/lib/session";
import { AREA_NAMES, type Profile, type Role } from "@/lib/types";
import { FamilyDates, datesFromFamily, type FamilyForm } from "./FamilyDates";
import { Card, btnPrimary, btnSecondary, field } from "./ui";

export function ProfileSetup({ role, onDone }: { role: Role; onDone: (p: Profile) => void }) {
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [family, setFamily] = useState<FamilyForm>({ birthday: "", anniversary: "", children: [] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function locate() {
    if (!navigator.geolocation) return setError("This browser can't share location. The area centre is used instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Couldn't get the location. The area centre is used instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const dates = role === "donor" ? datesFromFamily(family) : [];
      onDone(
        await saveMyProfile(role, {
          name,
          area,
          phone: phone || null,
          email: null,
          shop_name: role === "shop" ? shopName : null,
          birthday: role === "donor" && family.birthday ? family.birthday : null,
          dates,
          address: role === "shop" && address ? address : null,
          lat: role === "shop" ? (spot?.lat ?? null) : null,
          lng: role === "shop" ? (spot?.lng ?? null) : null,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <form className="space-y-5" onSubmit={submit}>
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight text-leaf-deep">
            {role === "shop" ? "Set up your shop" : "Set up your donor profile"}
          </h1>
          <p className="mt-2 leading-relaxed text-mute">
            {role === "shop"
              ? "Donors near you see your shop name, address and distance. You do this once."
              : "Add the days that matter to your family. Before each one, AnnaSetu plans a donation from shops near you."}
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block font-semibold">Your name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {role === "shop" ? (
          <label className="block">
            <span className="mb-1.5 block font-semibold">Shop name</span>
            <input className={field} value={shopName} onChange={(e) => setShopName(e.target.value)} required />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1.5 block font-semibold">Area</span>
          <select className={field} value={area} onChange={(e) => setArea(e.target.value)} required>
            <option value="">Pick your area</option>
            {AREA_NAMES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        {role === "shop" ? (
          <>
            <label className="block">
              <span className="mb-1.5 block font-semibold">Shop address</span>
              <input
                className={field}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="12, 11th Main, 4th Block"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-leaf-50 p-3 ring-1 ring-line">
              <button type="button" onClick={locate} disabled={locating} className={btnSecondary}>
                {locating ? "Finding you" : spot ? "Location saved, update" : "Use my current location"}
              </button>
              <span className="text-[14.5px] text-mute">
                {spot ? "Donors get directions to this exact spot." : "Stand in the shop and tap this, so donors get exact directions."}
              </span>
            </div>
          </>
        ) : (
          <FamilyDates value={family} onChange={setFamily} />
        )}
        <label className="block">
          <span className="mb-1.5 block font-semibold">Phone (optional)</span>
          <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </label>
        {error ? <p className="rounded-xl bg-chilli-soft px-4 py-3 text-chilli">{error}</p> : null}
        <button type="submit" disabled={saving} className={`${btnPrimary} min-h-13 w-full text-[17px]`}>
          {saving ? "Saving" : "Continue"}
        </button>
      </form>
    </Card>
  );
}
