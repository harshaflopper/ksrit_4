"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Card, btnPrimary, btnSecondary } from "@/components/ui";
import { formatDay, timeAgo } from "@/lib/dates";
import type { Deal } from "@/lib/types";

export default function FeedPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/items", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        setDeals(d.deals);
      })
      .catch((e: Error) => setError(e.message || "Couldn't load deals."));
  }, []);

  return (
    <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:py-8">
      <Card className="relative overflow-hidden bg-gradient-to-br from-white via-white to-leaf-50 p-6 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-turmeric-soft/70 blur-2xl" />
        <div className="relative max-w-[600px]">
          <h1 className="font-display text-[30px] font-bold leading-[1.1] text-leaf-deep sm:text-[40px]">Save the food. Save the shop. Feed the street.</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-mute">
            Shops near you list sealed packs close to expiry at a lower price every day. You buy them directly and give them
            yourself.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-[420px]">
            <Link href="/donate" className={btnPrimary}>
              I want to donate
            </Link>
            <Link href="/shop" className={btnSecondary}>
              I run a shop
            </Link>
          </div>
        </div>
      </Card>

      {error ? (
        <p className="rounded-card bg-chilli-soft p-4 text-chilli">{error}</p>
      ) : deals === null ? (
        <div className="grid gap-5 sm:grid-cols-2" aria-hidden>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="space-y-4 rounded-card bg-card p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="skeleton h-10 w-10 rounded-full" />
                <span className="flex-1 space-y-2">
                  <span className="skeleton block h-3.5 w-1/2" />
                  <span className="skeleton block h-3 w-1/3" />
                </span>
              </div>
              <span className="skeleton block aspect-[4/3] w-full rounded-xl" />
              <span className="skeleton block h-8 w-2/5" />
            </div>
          ))}
        </div>
      ) : deals.length === 0 ? (
        <Card className="py-10 text-center">
          <span aria-hidden className="mx-auto mb-3 block h-12 w-12 rounded-full bg-leaf-soft" />
          <p className="font-display text-[20px] font-bold">No packs listed yet</p>
          <p className="mt-1 text-mute">Shops add near-expiry stock from the My shop tab.</p>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {deals.map((d) => (
            <article key={d.id} className="lift flex flex-col overflow-hidden rounded-card bg-card shadow-card">
              <header className="flex items-center gap-3 px-5 pt-5">
                <Avatar name={d.shop_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{d.shop_name}</p>
                  <p className="text-[14px] text-mute">
                    {d.shop_area}, {timeAgo(d.created_at)}
                  </p>
                </div>
                <span
                  className={`nums shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                    d.pricing.daysLeft <= 1
                      ? "bg-chilli-soft text-chilli"
                      : d.pricing.daysLeft <= 7
                        ? "bg-turmeric-soft text-turmeric-ink"
                        : "bg-leaf-soft text-leaf-dark"
                  }`}
                >
                  {d.pricing.daysLeft} {d.pricing.daysLeft === 1 ? "day" : "days"} left
                </span>
              </header>
              <p className="px-5 pb-4 pt-3 text-[18px] font-semibold leading-snug">
                {[d.brand, d.product_name, d.net_quantity].filter(Boolean).join(" ")}
              </p>
              {d.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.photo} alt="" className="aspect-[4/3] w-full bg-leaf-50 object-contain" />
              ) : null}
              <div className="mt-auto flex flex-wrap items-end justify-between gap-3 p-5">
                <div className="nums flex items-baseline gap-2">
                  <span className="font-display text-[34px] font-bold leading-none text-leaf-deep">₹{d.pricing.price}</span>
                  <s className="text-mute">₹{d.mrp}</s>
                  <span className="self-center rounded-full bg-turmeric px-2.5 py-0.5 text-[13px] font-bold text-ink">
                    {d.pricing.discountPct}% off
                  </span>
                </div>
                <p className="nums text-[14.5px] text-mute">
                  {d.stock} left, expires {formatDay(d.expiry_date)}
                  {d.pricing.tomorrow ? `, ₹${d.pricing.tomorrow.price} tomorrow` : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
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
