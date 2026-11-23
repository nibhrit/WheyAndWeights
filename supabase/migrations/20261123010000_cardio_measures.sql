-- TF-74: skipping is logged in skips, HIIT and circuits in rounds of work / rest. Optional columns; every existing
-- session keeps working as it is. minutes stays required: the app works it out (skips at the effort's pace,
-- or rounds × (work + rest)) so calories are estimated the same way for every type.
alter table public.cardio_sessions
  add column skips   integer  check (skips is null or skips between 1 and 100000),
  add column rounds  smallint check (rounds is null or rounds between 1 and 200),
  add column work_s  smallint check (work_s is null or work_s between 5 and 3600),
  add column rest_s  smallint check (rest_s is null or rest_s between 0 and 3600);

-- Rounds come with their timings
alter table public.cardio_sessions
  add constraint cardio_rounds_timed check ((rounds is null) = (work_s is null) and (work_s is null) = (rest_s is null));
