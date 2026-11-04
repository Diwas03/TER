# Run TER collection without Railway

GitHub Pages hosts the PWA. Supabase runs a short Edge Function once per minute and stores the quote. No persistent server, TER login or OTP is needed while the public API remains available. Free-plan quotas, project pausing and service availability still apply. This setup samples once per minute and can miss price changes between checks; a 15-second PWA refresh does not increase collection frequency.

## 1. Prepare the database

In your Supabase project, open SQL Editor and run all of `supabase/schema.sql`.

## 2. Prepare deployment credentials

Generate a random secret on your computer:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Keep the result private. You will use the same value in the next two places.

- GitHub repository → Settings → Secrets and variables → Actions → New repository secret: add `COLLECTOR_SECRET` with that value.
- Supabase → Vault (under Database or locate Vault in dashboard search): create a secret named `ter_collector_secret` with that same value.

In your Supabase **account** settings → Access Tokens, generate a personal access token. Add it to GitHub Actions secrets as `SUPABASE_ACCESS_TOKEN`. This token authorizes deployment to your project; it is not the anon or service_role database key. Do not put any of these secrets in code or chat.

## 3. Deploy the function

In GitHub Actions select **Deploy Supabase price collector** → Run workflow on `main`. Require a green result. This configures the private function secret and deploys `collect-prices`. The handler validates that secret itself; platform JWT verification is intentionally disabled. The Supabase-hosted function uses its built-in server-side database bindings.

## 4. Activate the schedule

After successful deployment and Vault setup, run all of `supabase/schedule.sql` in Supabase SQL Editor. It enables pg_cron/pg_net and registers a single once-per-minute job. Rerunning replaces only this application's job. Wait two minutes, then check Table Editor → `price_observations` for new rows.

If no rows arrive, inspect Edge Functions → collect-prices → Logs and run:

```sql
select jobname, schedule, active from cron.job where jobname = 'ter-price-collector';
select status_code, timed_out, error_msg from net._http_response order by created desc limit 5;
```

A successful cron run only means the HTTP request was queued, not that the quote was stored. Require actual price rows with current source timestamps. The function refuses malformed, non-tradeable or stale quotes and returns HTTP 502 on collection failure. HTTP 401 indicates the Vault and Edge Function secrets do not match.

## 5. Connect the PWA

Enable GitHub Pages using GitHub Actions and run **Deploy TER PWA to GitHub Pages**. Expected project URL: `https://diwas03.github.io/TER/` (working only after successful Pages deployment). Private repository Pages requires an eligible GitHub plan, otherwise use a separate public PWA repository after reviewing what will be public.

In the PWA's Connection settings enter:

- URL: `https://figymesgyoritaokpwug.supabase.co`
- Public legacy anon key from Supabase project API settings.

Never use the service-role key in the PWA. Without the public key the page opens but cannot read stored prices. Verify the quote and timestamp match Supabase. Install using your phone browser's Add to Home Screen menu.

## 6. Stop Railway

After fresh rows continue arriving from Supabase, stop/remove the Railway worker to avoid duplicate collection and charges. No Railway service is required by this setup. Stop Supabase collection with `select cron.unschedule('ter-price-collector');`.

Expected usage: about 43,200 function calls and rows per 30 days, excluding manual retries. Each app tab polls Supabase every 15 seconds while visible. Check your actual plan quotas. The schema retains rows until you delete them; configure retention separately as data grows.

## Validation status

Quote parsing and freshness/scale tests run locally with `node --test tests/quote.test.mjs`. The Python monitor tests remain separate. Actual Edge Function deployment, database extension availability, outbound TER access, scheduled collection and the public Pages URL require verification in the configured project; local tests do not establish these work.
