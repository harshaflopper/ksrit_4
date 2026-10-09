"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Card, Spinner, btnPrimary, btnQuiet } from "@/components/ui";
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
    <main className="mx-auto max-w-[640px] space-y-4 px-4 py-5">
      <Card>
        <h1 className="font-display text-[24px] font-bold leading-tight">Feed people with food that would be thrown away</h1>
        <p className="mt-1 text-mute">
          Shops near you list sealed packs close to expiry at a lower price every day. You buy them directly and give them
          yourself.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/donate" className={btnPrimary}>
            I want to donate
          </Link>
          <Link href="/shop" className={btnQuiet}>
            I run a shop
          </Link>
        </div>
      </Card>

      {error ? (
        <p className="rounded-xl bg-chilli-soft p-4 text-chilli">{error}</p>
      ) : deals === null ? (
        <p className="flex justify-center py-12 text-mute">
          <Spinner />
        </p>
      ) : deals.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">No packs listed yet</p>
          <p className="text-mute">Shops add near-expiry stock from the My shop tab.</p>
        </Card>
      ) : (
        deals.map((d) => (
          <article key={d.id} className="overflow-hidden rounded-xl border border-line bg-card">
            <header className="flex items-center gap-3 px-4 pt-4">
              <Avatar name={d.shop_name} />
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight">{d.shop_name}</p>
                <p className="text-[14px] text-mute">
                  {d.shop_area}, {timeAgo(d.created_at)}
                </p>
              </div>
            </header>
            <p className="px-4 pb-3 pt-3 text-[17px] font-semibold">
              {[d.brand, d.product_name, d.net_quantity].filter(Boolean).join(" ")}
            </p>
            {d.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.photo} alt="" className="aspect-[4/3] w-full bg-page object-cover" />
            ) : null}
            <div className="flex flex-wrap items-end justify-between gap-2 p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[32px] font-bold leading-none">₹{d.pricing.price}</span>
                <s className="text-mute">₹{d.mrp}</s>
                <span className="rounded-md bg-turmeric px-2 py-0.5 text-[14px] font-semibold">{d.pricing.discountPct}% off</span>
              </div>
              <p className="text-[14.5px] text-mute">
                {d.stock} left, expires {formatDay(d.expiry_date)}
                {d.pricing.tomorrow ? `, ₹${d.pricing.tomorrow.price} tomorrow` : ""}
              </p>
            </div>
          </article>
        ))
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
