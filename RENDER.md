# Run the monitor on Render instead of Railway

Render's **paid Background Worker** can run the existing Docker browser monitor while your PC is off. Use a worker, not a static site or a free web service: this program has no HTTP listener and must not sleep between checks. The repository includes `render.yaml`; this deployment has not yet been executed or verified with Render.

## Deploy

1. Sign in at https://render.com and connect your GitHub account.
2. Select **New → Blueprint**, choose `Diwas03/jobauto`, branch `main`, and use `render.yaml` at the repository root. If importing manually, select **Background Worker**, Docker runtime, repository root, Dockerfile `./Dockerfile`, and one instance.
3. Review the proposed paid plan and disk charges before creating resources. The blueprint selects Standard to give Chromium more memory and adds a 1 GB persistent disk at `/data`. Check the current price in Render; no purchase has been made by this assistant.
4. Enter the requested private environment variables. They are marked `sync: false` so credentials are not stored in Git. See the table in CLOUD.md for each value. Use an approved proactive WhatsApp template for production. The optional Vercel dashboard is unnecessary for receiving WhatsApp alerts; if wanted, add `DASHBOARD_URL` and `MONITOR_API_TOKEN` manually.
5. Create/deploy the worker. Inspect build and runtime logs. Confirm that the live TER/BTN buy-price observations match your logged-in TER dashboard and verify a real WhatsApp delivery before treating the service as operational.

## TER login

Switching hosts does not remove TER's login requirement. On Windows, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\Export-Session.ps1
```

Enter CID, password, and OTP only on TER in that browser. Navigate to the dashboard and wait for its prices, then press Enter in PowerShell. Put the contents of the private `.runtime\cloud-session.json` file into Render's **private** `TER_BROWSER_SESSION_JSON` variable. Never paste it in chat or commit it. Set `TER_URL` to the exact page containing the price and `TER_PRICE_SELECTOR` to the verified unique CSS selector for the **TER/BTN Buy amount**. See CLOUD.md and DEPLOY.md for details.

TER may expire or reject a session moved to a different IP/device. You must then log in again, export a new session, update the private Render variable, and redeploy. Neither Render nor Railway can bypass OTP. If Railway was failing because of session rejection, a changed selector, or Twilio configuration, those same issues can occur here.

## Check failures

- **Build failure:** share the relevant error lines, without secrets. The worker uses the official Playwright Docker image and pinned Python package.
- **TimeoutError:** check the TER session, selected URL, and selector. It does not by itself prove a hosting failure.
- **HTTPError:** check Twilio configuration/delivery logs and network access; do not share authorization headers or response bodies containing private data.
- **Memory limit:** check Render resource metrics and choose an adequate paid worker size.
- **No alerts:** prices equal to 126 do not trigger. A first observed price below 126 does trigger; repeated low readings are suppressed until a reading at or above 126. Persistent state is at `/data/state.json`.

Once deployed and live-validated, the server runs independently of your PC until an outage or login expiry requires attention. No automatic login-expiry warning is currently implemented. Use the host logs/monitoring or optional dashboard to notice stale readings.
