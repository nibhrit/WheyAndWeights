-- TF-20: run send-reminders every 15 minutes.
-- Not a migration: it holds this project's URL and a secret, so it is pasted once into the SQL Editor by hand.
-- Before running: replace PASTE_CRON_SECRET_HERE with the same value you saved as the CRON_SECRET function secret.
-- The secret goes into Supabase Vault (encrypted), not into the job's text.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://dediwzfssalzonmlbehn.supabase.co', 'project_url');
select vault.create_secret('PASTE_CRON_SECRET_HERE', 'reminders_cron_secret');

select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it's scheduled:            select jobname, schedule, active from cron.job;
-- See the last runs:                select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- See what the function answered:   select status_code, content from net._http_response order by created desc limit 5;
-- Stop it:                          select cron.unschedule('send-reminders');
