# AnnaSetu

Hackathon app (AI for Sustainability). Shops list near-expiry **sealed packaged food** (chips, biscuits,
Maggi, juice, water, cakes; never loose food or staples). Donors nearby buy kits directly from the shop
and give them themselves. No NGO handles money.

## Flows
- **Shop** (`app/shop/page.tsx`): front + back photo and a voice note ("24 packets, expiry 20 October").
  `POST /api/shop/items` -> Gemini reads photos + note -> rules -> saved to inventory. If something is
  missing (unsure expiry, no stock count, no MRP) the API returns `needs` and the screen asks only that.
  Same product + same expiry merges into the existing row. Paid orders show at the top (polled every 8 s),
  with a "Handed over" button.
- **Donor** (`app/donate/page.tsx`): says the plan by voice ("feed 50 kids this Sunday, 2000 rupees").
  `POST /api/donor/parse` -> dates, people, budget, area, occasion (editable). `POST /api/donor/plan` ->
  Gemini combines nearby items into per-person kits (Maggi + water...) with a serving idea; `lib/planner.ts`
  checks every kit against real stock, expiry (must outlast the donation date), budget and distance (6 km).
  `POST /api/donor/orders` re-checks, takes stock out, one order per shop, saves the date to the donor's profile.
- **Voice** (`components/VoiceInput.tsx`): browser speech recognition (English, Kannada, Hindi), live text.
  Browsers without it record audio and `POST /api/transcribe` asks Gemini to transcribe.

## Golden rule
Gemini reads, understands and suggests. Plain code decides safety (`lib/evaluate.ts`, `lib/categories.ts`),
price (`lib/pricing.ts`) and stock (`lib/planner.ts`, order route). Never trust AI output without those checks.

## Pricing
Never stored; computed from expiry_date on every read. 31+ days: not listable. 15-30: 10% off.
14 days: 20%, rising daily to 80% on the last day. Expired: hidden, never sold (FSSAI: no sale after expiry).

## Identity
No login yet: `lib/session.ts` keeps one random id per role in localStorage (so one phone can demo both).
Next step: Clerk with Google; use the Clerk user id as `profiles.id` and read it server-side instead of
trusting `shop_id` / `donor_id` from the request body.

## Data
`lib/store.ts`: Supabase over REST when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, else `.data/*.json`.
Schema: `supabase/schema.sql` (profiles, items, orders; RLS on, server-only access).

## Conventions
Facebook-like layout: top tabs (Deals, My shop, Donate), white cards on a pale green page, 640px column.
Tokens in `app/globals.css`. Fonts Baloo 2 + Hind. No emojis, no charts. Plain sentence-case copy.
`npm test` must pass.
