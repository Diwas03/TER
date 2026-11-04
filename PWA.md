# TER PWA and price history

The new frontend is in `pwa/`; the old Vercel dashboard remains in `web/`. GitHub Pages serves only the PWA directory. No frontend build or npm dependencies are needed.

You can view stored prices without logging into TER. The collector still needs a valid TER session; this application cannot bypass TER OTP or session expiry. When the collector stops, the last price stays visible with a stale indicator. History begins when collection starts; no past prices are invented. No live collection, Supabase deployment, or Pages deployment has been verified yet.

## 1. Create Supabase

1. Create a Supabase project. Run all of `supabase/schema.sql` in its SQL Editor. It is safe to rerun.
2. In project API settings find the HTTPS project URL and **legacy anon** key. Put these public values in `pwa/config.js` (`url`, `anonKey`). Alternatively enter them in the PWA connection settings on each device. The frontend currently expects a legacy anon JWT, not the newer publishable key format.
3. Keep the **service_role** key private. Store it only in the collector host's private environment as `SUPABASE_SERVICE_ROLE_KEY`. Set `SUPABASE_URL` there too. Never put this key in the frontend, GitHub Pages variables/artifacts, or a commit.

The schema intentionally makes price observations publicly readable, including through the REST API. Only the collector's privileged key can write; anonymous INSERT/UPDATE/DELETE are denied by permissions and row level security. It stores only price and timestamps, never user/session/account data. Use a dedicated project or review this public-price policy before applying to an existing database. A service-role key is privileged across its project.

History returns 5-minute averages for 24h, 30-minute averages for 7d, and 2-hour averages for 30d; low/high statistics use actual readings. Missing buckets appear as gaps. Times display in the device's local timezone. The raw table grows by about 5,760 rows/day at a 15-second interval; monitor Supabase quotas and configure retention as needed. The UI displays only the last 30 days but does not delete old rows.

## 2. Publish on GitHub Pages

1. Commit/push these changes to `Diwas03/TER` on `main`, including your public config if using shared defaults.
2. Repository Settings → Pages → Source → **GitHub Actions**.
3. Run **Deploy TER PWA to GitHub Pages** from Actions (or push a PWA change to main).
4. Open the deployment URL reported by the successful workflow. Install via Chrome/Edge's install menu; on iPhone use Safari → Share → Add to Home Screen. Installation support depends on the browser. The app uses relative URLs to support the `/TER/` project path.

The shell and latest successful price/history responses are saved on the device. Offline cached data is labeled and never described as live. Connection settings contain only public values and remain on that device. An initial successful online visit is needed for offline use. No TER credentials belong in this app.

## 3. Start the collector

Use the existing Railway/Render worker instructions in `CLOUD.md` or `RENDER.md` (this repository is **Diwas03/TER**; some older docs refer to a previous repository). A persistent worker is needed for continuous collection; GitHub Pages cannot run Python, keep a browser logged in, or collect prices in the background.

Set privately on the worker:

- `SUPABASE_URL`: your project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: private legacy service-role key.
- `TER_PRICE_SELECTOR`: a unique selector verified against the real buy-price number.
- `TER_BROWSER_SESSION_JSON`: private session exported using the existing `windows/Export-Session.ps1` flow, or use a persistent local logged-in profile. Do not share sessions in chat.

With Python dependencies and Playwright Chromium installed, validate the selector/session first:

```sh
python monitor.py --once --dry-run
```

Compare the reading with the real TER page. Then test one history write with **no WhatsApp**:

```sh
python monitor.py --once --no-alerts
```

Require a successful row in Supabase and matching price/time on the PWA. Start continuous collection using `python monitor.py --no-alerts` (set this as the worker start-command override when using the existing Dockerfile). This mode does not alter alert-suppression state. For existing WhatsApp alerts, leave the original `python monitor.py` command and configure Twilio as documented. Prices are stored before attempting WhatsApp; failed history writes are logged and retried only via later observations, not durable backfill. Dry runs never publish history. Avoid multiple collectors writing duplicate readings.

When TER expires the login, manually log in with OTP, replace the private exported session, and restart the worker. No automatic OTP refresh is implemented. A documented public TER price API would be preferable if TER offers one.

## Validation

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check pwa/app.js
node --check pwa/sw.js
```

Serve locally for UI review: `python3 -m http.server 8000 --directory pwa`. Service workers require HTTPS or localhost. Database permissions/RPC behavior, real TER reading, history chart with live data, mobile installation, and public deployment must be verified after project/host configuration. The repository tests exercise HTTP dashboard routes, price logic, history payloads, and collection-only behavior with mocked external services.
