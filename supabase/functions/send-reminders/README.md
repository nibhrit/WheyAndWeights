# send-reminders

Phone reminders (TF-20) via Web Push. Every 15 minutes (pg_cron, `supabase/cron/reminders.sql`) it checks each person's
day in their time zone and pushes the reminders that are due, not sent today, and still relevant:

| Reminder | Default | Sent only if |
|---|---|---|
| Workout day | 6 pm | today has a planned split and no lift or cardio is logged |
| Protein check | 7 pm | protein is under the goal |
| Log your food | 9 pm | fewer than 2 foods are logged |

A reminder can go out up to 90 minutes after its time, at most once a day (`reminder_log`). Devices the push service
reports as gone are removed. Signed-in users can also fetch the public key (`{action:"key"}`) and send themselves a test
(`{action:"test"}`). Pure logic is in `shared.ts`, tested in `app/tests/food.test.ts`.

## Setup (once)

1. **Keys.** In your own terminal (not in chat): `npx web-push generate-vapid-keys`.
   Also make a cron secret: `openssl rand -hex 32`.
2. **Function secrets** (Supabase → Edge Functions → Secrets): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.
   Optional `VAPID_SUBJECT` (defaults to the GitHub repo URL).
3. **Database.** SQL Editor: run `supabase/migrations/20261101000000_push_reminders.sql`.
4. **Deploy** `send-reminders` (paste `index.ts` and `shared.ts`) with **Verify JWT OFF**. The function checks the cron
   secret or the user's token itself; the cron call has no user token.
5. **Schedule.** SQL Editor: run `supabase/cron/reminders.sql` with your cron secret pasted in.
6. In the app: Settings → Reminders → Turn on reminders → Send a test.
