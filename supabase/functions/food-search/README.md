# food-search

Relay for searching packaged foods by name on Open Food Facts (TF-38). The search service doesn't accept calls from a
web page and asks apps to identify themselves, so the app calls this function instead. Barcode lookups don't use it.

- **Who can call it:** signed-in users only (the Authorization header is checked with Supabase Auth).
- **Secrets:** none of its own. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.
- **Limits:** Open Food Facts allows 10 searches a minute; the app throttles to 8 and searches only on a button press.
- **Data:** Open Food Facts (ODbL / DbCL). Nothing is stored.

## Deploy (dashboard)

Supabase → Edge Functions → Deploy a new function → name `food-search` → paste `index.ts` → keep **Verify JWT** on → Deploy.
