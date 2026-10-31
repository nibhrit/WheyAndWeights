-- TF-20: phone reminders (Web Push).
-- push_subscriptions: one row per device that turned reminders on (the browser's push endpoint and keys).
-- reminder_settings:  per person: which reminders, at what local time, in which time zone.
-- reminder_log:       what was sent, so each reminder goes out at most once a day. Written only by the server.
-- The Edge Function send-reminders (run every 15 minutes by pg_cron, see supabase/cron/reminders.sql) reads these
-- with the service role, checks each person's day, and sends.

-- ---------- Devices ----------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 20 and 200),
  auth        text not null check (char_length(auth) between 10 and 100),
  device      text check (device is null or char_length(device) <= 120),   -- e.g. "iPhone", to tell devices apart
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
create policy "own devices" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Settings ----------
-- Times are local wall-clock times in time_zone, on the quarter hour (the job runs every 15 minutes)
create table public.reminder_settings (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  time_zone     text not null default 'Asia/Kolkata' check (char_length(time_zone) between 1 and 64),
  food_on       boolean not null default true,
  food_at       time not null default '21:00' check (extract(minute from food_at)::int % 15 = 0),
  protein_on    boolean not null default true,
  protein_at    time not null default '19:00' check (extract(minute from protein_at)::int % 15 = 0),
  workout_on    boolean not null default true,
  workout_at    time not null default '18:00' check (extract(minute from workout_at)::int % 15 = 0),
  updated_at    timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;
revoke all on public.reminder_settings from anon;
create policy "own settings" on public.reminder_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Sent log (server only) ----------
create table public.reminder_log (
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('food', 'protein', 'workout')),
  local_date  date not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;   -- no policies: only the service role reads or writes
