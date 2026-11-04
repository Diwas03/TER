# TER PWA: public API setup

The default collector now reads `https://api.ter.bt/prices` without login cookies. Select exactly `TERBTN` and divide its integer `ask_price` by 10,000. The user verified this scale against the dashboard. Store the API `effective_at` timestamp; reject non-tradeable, malformed, duplicate-product, older-than-60-second or more-than-10-second-future quotes. Poll every 15 seconds, allowing slow requests to finish without overlapping/catch-up bursts. Public API availability and permission can change; stop on failures rather than bypassing authentication.

## Railway: current steps

1. Deploy the latest `main` commit of `Diwas03/TER`. The Dockerfile now uses Python only and defaults to `python monitor.py --no-alerts`.
2. If a custom Start Command is set, use `python monitor.py --no-alerts`.
3. Set private worker variables `SUPABASE_URL=https://figymesgyoritaokpwug.supabase.co` and `SUPABASE_SERVICE_ROLE_KEY` to your private legacy service-role key. Set `TER_INTERVAL_SECONDS=15`.
4. Remove unneeded `TER_BROWSER_SESSION_JSON` and `TER_PRICE_SELECTOR` variables. This API path needs no TER credentials. The previously exposed TER session should be revoked.
5. Run `supabase/schema.sql` in Supabase SQL Editor once (safe to rerun).
6. Deploy, require `Observed TERBTN API buy price` in logs, and verify matching rows in Supabase `price_observations`. A running worker without rows does not prove history works. Failed writes log `History write failed`.
7. Keep a single worker. Railway's trial still expires; the smaller worker reduces resource requirements but does not make hosting free. GitHub Pages cannot run this collector. GitHub scheduled Actions are a slower alternative, not 15-second collection.

No separate API key or TER login is needed while this endpoint remains public. The cloud worker may receive a different response from your home connection; validate its actual logs.

## Phone PWA and GitHub Pages

1. Supabase API settings: copy the public **legacy anon** key, not service_role. Enter it and the project URL in the PWA Connection settings, or put only these public values in `pwa/config.js`.
2. GitHub Settings → Pages → Source → GitHub Actions. Private repositories need an eligible plan; alternatively publish only the PWA in a separate public repository. Do not make a private repository public without reviewing its files and history for secrets.
3. Run the **Deploy TER PWA to GitHub Pages** workflow. Open the successful deployment URL. Android Chrome: Install app; iPhone Safari: Share → Add to Home Screen.
4. The PWA refreshes every 15 seconds while visible. Offline cached observations are labeled; timestamps and stale indicators prevent presenting old prices as live. Public read access to prices is intentional; privileged writes stay on the worker.

History starts when collection begins. The schema returns bucket averages for 24h/7d/30d; low/high statistics use actual readings. Raw collection retains each successful poll, approximately 5,760 rows/day, so monitor storage quotas. No automatic retention deletion is configured. Source timestamps may repeat if TER has not published a new quote.

## Local validation and optional alerts

```sh
python3 monitor.py --once --dry-run
python3 monitor.py --once --no-alerts
python3 monitor.py --no-alerts
```

The first command never writes history or sends alerts. The second requires configured Supabase to save a row. Without SUPABASE_URL, history publishing is optional and skipped. To enable existing WhatsApp alerts, use `python monitor.py` with the Twilio settings from the legacy instructions. The default Docker command does not send alerts.

Legacy browser mode remains available locally as `python monitor.py --source browser`; install `requirements.txt` and Playwright Chromium for that fallback. It requires a selector and valid session. The slim Docker image intentionally does not contain the browser dependencies. Older CLOUD/DEPLOY/RENDER instructions describe this legacy browser setup; use the API steps above for current deployment.

Tests: `.venv/bin/python -m unittest discover -s tests -v`. Tests validate parsing, timestamp rules, no-session collection, history writes and existing alerts using mocks. The API response and scale were verified on the user's computer; live API/Supabase access from the development environment and Railway deployment remain unverified.
