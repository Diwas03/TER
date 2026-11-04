# Dashboard refresh and 15-second collection

The redesigned PWA includes buy/sell quote cards, spread, changes since the previous received quote, a buy/sell history selector, and streamlined target/push settings. Values are real observations, not placeholder prices. The chart uses historical bucket averages; the cards show the newest quote. Old rows without sell prices remain empty in sell history.

## Activate in Supabase

1. Run `supabase/dashboard-upgrade.sql` in SQL Editor. If you have not added the sell column, run `supabase/add-sell-price.sql` first. The upgrade creates buy/sell history RPC and adds **only price_observations** to the `supabase_realtime` publication. Private push subscriptions are not broadcast.
2. Run the updated `supabase/schedule.sql` in SQL Editor. It replaces only `ter-price-collector` with a **15 seconds** schedule, retaining the existing Vault secret. The transaction preserves your old schedule if activation fails. Second-based schedules require pg_cron 1.6+; if unsupported, use Supabase's supported extension upgrade process, retaining one-minute polling until it is available.
3. Check `select jobname, schedule, active from cron.job where jobname = 'ter-price-collector';` and require `15 seconds`. Verify fresh rows appear and Edge Function invocations succeed. Slow execution, provider rate limits or errors can still delay/miss checks.
4. Wait for the GitHub Pages deployment to complete, then close all old PWA tabs and reopen the app. Existing connection settings, push registration and targets are retained.

## What “live” means

An open app subscribes to the public Supabase INSERT stream and updates cards as quotes are saved. It still polls latest prices every 15 seconds as a fallback; history RPC calls run at most once per minute while the range/side stays unchanged. Tabs suspend the live socket when hidden and reconnect on return. Reconnects use bounded backoff. Offline cached values remain labeled and are not used for alerts. Out-of-order quotes cannot overwrite a newer source timestamp.

This does not provide a direct guaranteed-instant feed from TER. Expected pipeline: poll TER → save to Supabase → broadcast to phone. A price move immediately after a poll can take about 15 seconds plus network/processing time to appear. API timestamps are checked; stale quotes are rejected. If live broadcasting is unavailable, REST polling adds up to another polling interval. Do not display cached readings as live.

Fifteen-second collection is approximately **172,800 Edge Function calls and stored rows per 30 days** (four times the previous one-minute schedule), plus push, database/API, and Realtime usage. Check actual plan quotas, storage and provider limits. The app never purchases more capacity automatically. To return to one-minute collection, change the schedule string in schedule.sql to `* * * * *` before running it.

Phone push alerts now check on each scheduled collection, with delivery subject to phone/browser permissions and push-provider delays. Existing push setup and RLS rules remain in PUSH_SETUP.md. Local tests use mocked market data and WebSocket messages; real cloud activation still requires checking your project.
