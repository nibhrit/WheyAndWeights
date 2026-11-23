-- TF-73: more cardio types: skipping (jump rope), HIIT and circuit training.
-- Adding enum values keeps every existing entry as it is. Calories are estimated in the app (lib/calories.ts).
alter type public.cardio_kind add value if not exists 'skipping' before 'other';
alter type public.cardio_kind add value if not exists 'hiit' before 'other';
alter type public.cardio_kind add value if not exists 'circuit' before 'other';
