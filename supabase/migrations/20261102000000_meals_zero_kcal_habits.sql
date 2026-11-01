-- TF-63 meal on each food entry · TF-64 zero-calorie items (creatine) · TF-65 your own habits.

-- ---------- TF-63: meals ----------
-- Every entry belongs to a meal, picked when logging (defaults by time of day). Existing entries get one from the
-- local time they were logged (the person's reminder time zone if set, else India).
create type public.meal as enum ('breakfast', 'lunch', 'snacks', 'dinner');

alter table public.protein_entries add column meal public.meal;

update public.protein_entries e set meal = (
  case
    when h >= 4 and h < 11 then 'breakfast'
    when h >= 11 and h < 16 then 'lunch'
    when h >= 16 and h < 19 then 'snacks'
    else 'dinner'
  end)::public.meal
from (
  select p.id, extract(hour from p.logged_at at time zone coalesce(r.time_zone, 'Asia/Kolkata'))::int as h
  from public.protein_entries p left join public.reminder_settings r on r.user_id = p.user_id
) t
where t.id = e.id;

-- ---------- TF-64: zero-calorie items ----------
-- Creatine and similar have no protein or calories, but still record an amount. An entry must carry protein,
-- calories, or an amount eaten.
alter table public.protein_entries drop constraint protein_entries_not_empty;
alter table public.protein_entries
  add constraint protein_entries_not_empty check (grams > 0 or coalesce(kcal, 0) > 0 or coalesce(portion_grams, 0) > 0);
alter table public.quick_adds drop constraint quick_adds_not_empty;
alter table public.quick_adds
  add constraint quick_adds_not_empty check (grams > 0 or coalesce(kcal, 0) > 0 or coalesce(portion_grams, 0) > 0);

-- ---------- TF-65: your own habits ----------
-- kind 'do' answers Done / Missed; 'avoid' answers Avoided / Had it. A log's result is 'yes' for the good answer
-- (done, avoided) and 'no' for the other. Removing a habit archives it, so its history stays.
create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  kind         text not null check (kind in ('do', 'avoid')),
  sort_order   smallint not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index habits_user on public.habits (user_id);

create table public.habit_logs (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    uuid not null references public.habits (id) on delete cascade,
  date        date not null,
  result      text not null check (result in ('yes', 'no')),
  updated_at  timestamptz not null default now(),
  primary key (habit_id, date)
);
create index habit_logs_user_date on public.habit_logs (user_id, date);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
revoke all on public.habits, public.habit_logs from anon;
create policy "own habits" on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own habit logs" on public.habit_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid())));

-- Everyone starts with the two habits the app had: sugar and junk food (Avoid), with their history copied over.
-- daily_habits is kept as it was (read-only from now on) in case anything needs checking.
insert into public.habits (user_id, name, kind, sort_order)
select s.user_id, x.name, 'avoid', x.ord
from public.user_settings s cross join (values ('Sugar', 0), ('Junk food', 1)) as x(name, ord);

insert into public.habit_logs (user_id, habit_id, date, result, updated_at)
select d.user_id, h.id, d.date, case d.sugar when 'avoided' then 'yes' else 'no' end, d.updated_at
from public.daily_habits d join public.habits h on h.user_id = d.user_id and h.name = 'Sugar'
where d.sugar is not null;

insert into public.habit_logs (user_id, habit_id, date, result, updated_at)
select d.user_id, h.id, d.date, case d.junk_food when 'avoided' then 'yes' else 'no' end, d.updated_at
from public.daily_habits d join public.habits h on h.user_id = d.user_id and h.name = 'Junk food'
where d.junk_food is not null;

-- New people get the same two to start with (they can rename, remove or add their own)
create function public.seed_default_habits() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.habits (user_id, name, kind, sort_order)
  values (new.user_id, 'Sugar', 'avoid', 0), (new.user_id, 'Junk food', 'avoid', 1);
  return new;
end;
$$;

create trigger user_settings_seed_habits after insert on public.user_settings
  for each row execute function public.seed_default_habits();
