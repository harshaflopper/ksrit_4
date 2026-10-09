-- AnnaSetu database. Paste into Supabase > SQL Editor > Run.
-- Price is NOT stored: it's worked out from expiry_date on every read (lib/pricing.ts).
-- RLS is on with no public policies: only the server (service role key) reads and writes.

create table if not exists public.profiles (
  id          text primary key,            -- random id now, Clerk user id later
  created_at  timestamptz not null default now(),
  role        text not null check (role in ('shop', 'donor')),
  name        text not null,
  email       text,
  phone       text,
  area        text not null,
  shop_name   text,
  birthday    date,
  dates       jsonb not null default '[]', -- [{label, date, kind}] birthdays, anniversary, children's birthdays
  address     text,                        -- shops: street address shown to donors
  lat         double precision,            -- shops: exact location for distance and maps
  lng         double precision
);
-- For a database made before shop locations existed.
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists lat double precision;
alter table public.profiles add column if not exists lng double precision;

create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  shop_id       text not null references public.profiles(id),
  shop_name     text not null,
  shop_area     text not null,
  product_name  text not null,
  brand         text,
  net_quantity  text,
  category      text not null,
  mrp           numeric(10, 2) not null check (mrp > 0),
  mfg_date      date,
  expiry_date   date not null,
  stock         integer not null check (stock >= 0),
  photo         text,
  voice_note    text,                    -- what the shopkeeper said, as Gemini heard it
  voice_id      uuid,                    -- latest recording in public.voices
  status        text not null default 'active' check (status in ('active', 'sold_out', 'removed'))
);
create index if not exists items_status_idx on public.items (status, expiry_date);
create index if not exists items_shop_idx on public.items (shop_id);

-- For a database made before voice recordings were kept.
alter table public.items add column if not exists voice_id uuid;

-- Shopkeepers' voice notes (WAV data URL), kept out of items so lists stay light.
create table if not exists public.voices (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  shop_id     text not null references public.profiles(id),
  item_id     uuid not null references public.items(id),
  transcript  text,
  audio       text not null
);
create index if not exists voices_item_idx on public.voices (item_id);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  donor_id       text not null references public.profiles(id),
  donor_name     text not null,
  shop_id        text not null references public.profiles(id),
  shop_name      text not null,
  shop_area      text not null,
  donation_date  date not null,
  occasion       text,
  people         integer not null check (people > 0),
  lines          jsonb not null,           -- [{item_id, product_name, qty, unit_price, mrp}]
  total          numeric(10, 2) not null,
  status         text not null default 'paid' check (status in ('paid', 'handed_over'))
);
create index if not exists orders_shop_idx on public.orders (shop_id);
create index if not exists orders_donor_idx on public.orders (donor_id);

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.orders enable row level security;
alter table public.voices enable row level security;
