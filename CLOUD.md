# Monitor TER while your PC is off

Use **Railway for the always-on browser worker**. GitHub stores the code; Vercel optionally hosts the dashboard. Neither GitHub Pages nor ordinary Vercel functions run this persistent 15-second browser loop. GitHub Actions schedules are delayed and minute-based, not a reliable continuous service.

## Deployment status

The Dockerfile, Railway configuration, and session export are implemented. No cloud worker has been deployed: there is no connected hosting account in this workspace. Live authenticated TER readings and real WhatsApp delivery remain unverified. Browser downloads and public TER HTML access now succeed, but that does not establish authenticated access. The Docker image itself and Windows commands have not been executed here.

## 1. Export your TER session once on Windows

Install Python 3.12+ and download/clone the repository. In PowerShell inside the repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\Export-Session.ps1
```

Sign in to TER in the opened browser using your own CID, password, and OTP. Navigate to the dashboard with **Live TER Prices**, wait for prices to load, and only then press Enter in PowerShell. This saves `.runtime\cloud-session.json`, containing private cookies/local storage and session storage. Treat this file like a password. Never commit it, paste it into chat, or expose it on the Vercel website. Securely delete the export after storing it with your host.

While on that dashboard, use F12's element picker on the **TER/BTN Buy numeric price** and copy its CSS selector. See DEPLOY.md. The screenshot cannot determine a stable selector.

Session transfer is not guaranteed: TER may bind login to a device/IP or require other browser state. If the cloud session is rejected, use an official TER price API or a provider-supported interactive login on the cloud host. Do not bypass OTP or disable security checks.

## 2. Create a Railway worker

1. Connect your GitHub account in Railway and select **Deploy from GitHub repo → Diwas03/jobauto**, branch `main`.
2. Use the **repository root**, not `web`. Railway should detect the Dockerfile and `railway.toml`. No public domain or HTTP healthcheck is needed for this background worker.
3. Add a persistent volume mounted at `/data` to preserve alert state. Run **one replica**. Choose an always-on plan with adequate browser memory (start around 1 GB and check usage); turn off any sleep/serverless mode. Hosting fees and provider availability apply.
4. Set the following **private service variables** before starting:

| Variable | Value |
| --- | --- |
| `TER_BROWSER_SESSION_JSON` | Full contents of your private exported JSON file; enter only in the host's private variables interface |
| `TER_URL` | Exact logged-in TER page URL containing the live Buy price (defaults to the originally supplied buy page) |
| `TER_PRICE_SELECTOR` | Verified unique selector for the BTN buy-price amount |
| `TER_THRESHOLD` | `126` |
| `TER_INTERVAL_SECONDS` | `15` |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your private Twilio Auth Token |
| `TWILIO_WHATSAPP_FROM` | Approved sender, `whatsapp:+internationalnumber` |
| `TWILIO_WHATSAPP_TO` | Your opted-in recipient, same format |
| `TWILIO_CONTENT_SID` | Approved proactive WhatsApp template; variables 1=price, 2=threshold |
| `DASHBOARD_URL` | Optional Vercel production URL |
| `MONITOR_API_TOKEN` | Same private token as Vercel, only when using the dashboard |

Follow Twilio setup in DEPLOY.md. An approved template/sender is needed for production alerts outside the service window. Free-form sandbox testing is not sufficient for indefinite proactive alerts.

5. Deploy and inspect logs. Require successful actual TER/BTN buy-price observations and compare them to your logged-in page. A running process alone is insufficient. A `TimeoutError` can mean expired login or a bad selector.
6. Verify a real WhatsApp message using a controlled temporary threshold above the observed price, then stop the worker, restore `126`, review/reset `/data/state.json`, and restart. This triggers a real message and may incur a fee. Check actual handset delivery and Twilio's logs.
7. Turn off your PC and confirm fresh dashboard readings/worker logs continue. Only then is the independent cloud setup validated.

## Login expiry and availability

You do not need your PC on during normal cloud monitoring. **If TER expires the session, you must log in and provide OTP again**, export a new session, update the private cloud variable, and restart. The worker cannot invent or bypass OTP. It does not currently send a separate login-expiry warning; use the optional Vercel dashboard's stale status plus host uptime/log monitoring. Stale quotes, site changes, provider outages, failed messages, and polling gaps can prevent alerts.

The session export is a startup seed, not a guarantee of indefinite refresh. Browser memory can refresh credentials during a run, but those refreshes are not saved back to the host variable. A restart may need a new export.

The alert triggers on an observed buy price **strictly below Nu. 126**, including the first reading if already below it. A value equal to 126 does not alert. It rearms at or above 126. The page reports indicative prices, not guaranteed executable trade prices. There is no automatic trading.

## Alternative to Railway

Use a paid Render Background Worker with the included `render.yaml`. See [RENDER.md](RENDER.md) for deployment and private session configuration. It has not been live-tested on Render.
