-- TF-60: searches that didn't find the food, so the food list grows from what people actually eat.
-- A "miss" is a search that ended in an AI estimate, typed numbers, or no pick with no good match.
-- Private: each person sees only their own; one row per query per day (repeats that day are ignored).

create table public.food_search_misses (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  query       text not null check (char_length(query) between 3 and 80 and query = lower(btrim(query))),
  local_date  date not null,
  outcome     text not null check (outcome in ('ai', 'typed', 'none')),
  created_at  timestamptz not null default now(),
  primary key (user_id, query, local_date)
);

alter table public.food_search_misses enable row level security;
revoke all on public.food_search_misses from anon;
create policy "own misses" on public.food_search_misses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
