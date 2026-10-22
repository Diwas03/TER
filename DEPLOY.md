# Publish the dashboard on Vercel and run the monitor on Windows

The Vercel website is a private status dashboard. The Windows program logs in to TER, reads the buy price approximately every 15 seconds, sends WhatsApp alerts, and publishes price/status to Vercel. Your CID, password, OTP, and TER session stay on Windows. Vercel does not run a persistent authenticated browser or a 15-second background monitor. Your computer must stay awake and online.

## 1. Put this code on GitHub

The workspace contains the implementation, but it has not been pushed. From a checkout connected to `Diwas03/jobauto`, review files, commit them, and push to your chosen branch. Never include `.env`, `.runtime`, or `.venv`. If Git reports no commits on `main`, create/push the first commit before importing the repository in Vercel.

## 2. Create dashboard storage

Create an Upstash Redis database (directly or through the Vercel Marketplace). Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel's server-side environment variables. These are distinct from TER credentials. Use a dedicated database or account; this app stores its latest status at `ter-monitor:status:v1` for 24 hours.

## 3. Import into Vercel

- Select **Add New → Project**, then import `Diwas03/jobauto`.
- Set **Root Directory** to `web`, **Framework Preset** to **Other**. There is no frontend build step; serve the root directory as static output (output directory `.` if requested). The `api/status.py` file becomes a Python serverless function.
- Add server environment variables `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `MONITOR_API_TOKEN` for Production. Generate the last value locally with `py -c "import secrets; print(secrets.token_urlsafe(32))"`. Keep it private. It grants both read and write access to this single-user dashboard; anyone holding it can submit fake prices.
- Deploy. Record the HTTPS production URL. Redeploy after changing server environment variables. Do not place any credentials in frontend files or public-prefixed variables.
- Ensure your production deployment is reachable by the Windows monitor. Vercel Deployment Protection may require you to configure its supported automation bypass separately; this program does not implement bypass tokens. Keep the application token enabled even if the page is publicly reachable.

No Vercel account connection or deployment access is available in the development workspace, so a live deployment has not been performed or verified. Vercel controls pricing and supported runtimes; review your dashboard if it prompts for updated settings.

## 4. Set up WhatsApp with Twilio

Create a Twilio account. Open its WhatsApp Sandbox and join from your phone using the console's displayed instructions. Get the Account SID, Auth Token, WhatsApp sender, and your recipient number. Both numbers must use `whatsapp:+internationalnumber`.

For unattended proactive alerts outside the 24-hour WhatsApp service window, configure an approved sender and an approved Content Template. Set its variables to `1` = observed buy price and `2` = threshold, and supply the resulting Content SID. Sandbox testing alone is not a reliable production alert channel. Twilio fees, recipient opt-in, and WhatsApp template restrictions apply. Acceptance by Twilio does not confirm delivery; verify a real test message in the console and on your phone.

## 5. Start the Windows monitor

Install Python 3.12+ from python.org and Git for Windows. Clone or download this repository, open PowerShell in its folder, and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\Start-Monitor.ps1
```

This invocation applies the execution-policy setting only to that PowerShell process. The script installs dependencies/browser, prompts for Twilio and dashboard settings, and opens a dedicated browser profile. Sign in on TER yourself with CID, password, and phone OTP. The program cannot bypass OTP. Keep browser/session files private.

**Identify the correct price field:** while signed in on the TER dashboard, press F12 (Developer Tools), activate the element picker, click the green numeric Buy amount inside the **TER/BTN** card, and use **Copy → Copy selector** on that element. Supply this CSS selector when prompted. Select the amount itself, not the entire card or its Buy label. A screenshot cannot establish a reliable DOM selector. Test this against a real logged-in page; copied structural selectors can need updating after TER site changes.

The script first prints one reading without sending. Confirm it matches the live TER/BTN buy amount. Only then will it start monitoring and alerts. Browser integration, Windows execution, and real WhatsApp delivery have not yet been tested in this development environment.

Open your Vercel URL, enter `MONITOR_API_TOKEN`, and select Connect. The token remains in tab memory. A status older than 60 seconds is marked stale; this can mean sleep, lost connectivity, expired login, or a failed notification. If WhatsApp submission fails, the current implementation does not publish that observation. Check the Windows console and Twilio logs. Dashboard updates do not independently verify quote freshness.

## Alert behavior

Default: **buy price strictly below Nu. 126**. A reading of 126.0000 does not alert; 125.9999 does. If the first reading is already below 126, it alerts immediately. Repeated low readings are suppressed until a reading at or above 126 rearms it. The threshold is configured on Windows; the dashboard displays the received setting and cannot edit it.

Do not run two monitors with the same state/profile. `.runtime/state.json` preserves alert suppression; stop the monitor before editing state or changing thresholds. Login expiry requires manual login/OTP again. Keep Windows awake and the PowerShell window open; closing it stops the monitor. For actual 24/7 operation without your computer, a persistent host with a supported secure interactive login flow or an official TER price API is needed.

## Verification

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Unit tests exercise pricing, alert suppression, mocked WhatsApp submission, payload validation, and mocked status relay. They do not demonstrate live TER access or real message delivery. No fake prices are shown as live prices on the dashboard.
