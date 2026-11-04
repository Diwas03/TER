# Current TER prices and saved history

The two quote cards now request the public TER feed through the read-only Supabase endpoint `/functions/v1/collect-prices/quote` every 15 seconds while visible. It fetches only the fixed `https://api.ter.bt/prices` upstream without login cookies, converts the TERBTN ask/bid by 10,000 and retains effective_at. It never writes a row or triggers background notifications. CORS permits reading public quote data; protected scheduled collection still requires the collector secret.

History loading is independent and cannot delay a completed price response. Stored rows and realtime updates remain useful fallbacks; source timestamps prevent an older saved response from replacing a newer API response. Bad future timestamps cannot freeze the feed. Cached/offline readings are labeled, and the quote age updates every second. After 30 seconds the quote is marked delayed, after 60 seconds stale. Live API responses older than 60 seconds or more than 10 seconds in the future are rejected.

## Activate

The push triggers two workflows: **Deploy Supabase price collector** and **Deploy TER PWA to GitHub Pages**. Require both to succeed on the latest commit, then close all old app tabs and reopen. No new database SQL or secret is needed for this fix. Older collector versions return no current quote at this path, so the app deliberately falls back to stored data with a message rather than showing fabricated current prices.

To compare, view the app and the TER site at approximately the same time. Compare buy against ask and sell against bid, both in TER/BTN, and inspect source time. Separate 15-second polling loops are not phase-locked, so brief differences can remain. This is a polling feed, not a guaranteed instantaneous exchange stream. If a discrepancy remains with matching timestamps, inspect the prices payload on the logged-in TER site to establish whether it uses a different quote/account adjustment; do not share its cookies/headers.

## History and closed-app alerts

The scheduled Supabase job still saves history and checks phone push targets. Opening the app does not change that job or backfill its gaps. The updated 15-second schedule SQL must have been applied separately. Inspect it with:

```sql
select jobname, schedule, active from cron.job where jobname = 'ter-price-collector';
select price, sell_price, observed_at, received_at,
       now() - observed_at as quote_age
from public.price_observations order by observed_at desc limit 5;
```

An open tab adds up to four public quote function calls per minute, in addition to scheduled collection. Tabs suspend requests when hidden. Account for actual active users in Supabase quotas. Current quote reads remain available when history is unavailable, but push registration/history still need valid public Supabase settings.

## Validation

Node tests exercise the fixed public upstream, no-credential/no-cache requests, price scale, freshness, older response rejection and future-clock recovery. The browser test models slow history, direct quotes, old saved rows and direct-feed failure. The upstream was blocked by the development environment's proxy, so hosted TER/Supabase data matching remains unverified until deployed and compared on the user's device.
