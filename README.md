# TER WhatsApp price monitor

**Buy/sell quotes and phone push alerts: activate the upgrade using [PUSH_SETUP.md](PUSH_SETUP.md).**

**No Railway needed: follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for scheduled Supabase collection and the phone PWA.**

**Current collector: public TER price API, no login/OTP/browser required. See [PWA.md](PWA.md) for current Railway and Supabase steps. Older browser instructions below apply only with `--source browser`.**

**New: installable GitHub Pages PWA with Supabase price history. See [PWA.md](PWA.md) for setup.**

**To run checks in this GitHub repository without your PC, follow [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md).** This checks approximately every five minutes, can be delayed, and requires private session/WhatsApp configuration. Scheduled checks are disabled until enabled in repository settings. This is an alternative to the continuous 15-second cloud worker.

**To run while your PC is off, follow [CLOUD.md](CLOUD.md) for a persistent Railway worker.** Vercel is only the optional dashboard. Sessions can expire and require a fresh manual OTP login.

For Windows and the Vercel website, follow [DEPLOY.md](DEPLOY.md). The default target is now strictly below Nu. 126. The Vercel dashboard and Windows setup are implemented but not live-validated.

Monitors the TER **buy price** at https://ter.bt/portal/dashboard/trade/buy and requests a WhatsApp alert through Twilio when it is **strictly below 126**. Checks every 15 seconds by default. No AI or trading permission is needed. This program never buys or sells.

**Status:** monitoring logic is implemented and unit-tested. Live TER access, the correct price selector/currency, and WhatsApp delivery have not been verified. The cloud proxy currently denies access to TER. Do not run unattended until the live price field and currency have been confirmed.

## Install

Python 3.12+:

```sh
cd /workspace/jobauto
python -m venv .venv
.venv/bin/pip install -r requirements.txt
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright .venv/bin/python -m playwright install chromium
.venv/bin/python -m unittest discover -s tests -v
```

Chromium also requires Linux browser libraries; if Playwright reports missing libraries, install them using your system administrator's supported package workflow. Browser downloads require Playwright's official CDN destinations.

## Configure TER

TER refreshes its buy/sell prices every 15 seconds according to the requested workflow. Monitor only the buy field. Browser navigation and request time add to the 15-second delay; this is polling, not a guarantee of observing every update.

Supply environment variables listed in `.env.example` through secure runtime settings or your shell. The program does not automatically load `.env` files. Never commit credentials, browser sessions, or runtime state.

Confirm that 125 is in the currency and per-token units displayed by TER. Inspect the live buy-price field in a browser and set `TER_PRICE_SELECTOR` to a unique CSS selector for that field. The field must contain only one numeric price with an optional BTN/Nu/TER label. Do not guess this selector. The monitor fails closed on missing, ambiguous, zero, or malformed prices. It does not yet independently verify the timestamp or freshness of a quote; confirm the page supplies current quotes before use.

TER requires login. Run `.venv/bin/python monitor.py --login` on a machine with a visible desktop and complete login yourself. The browser session is stored in `.runtime/browser`; treat it like a password. Headless cloud environments without a desktop cannot complete interactive login using this command. Never send login credentials in chat.

First validate a real reading without sending messages:

```sh
.venv/bin/python monitor.py --once --dry-run
```

Compare the logged number to the live TER buy price. A passing unit test does not validate the TER page.

## Configure WhatsApp

1. Create a Twilio account and enable its WhatsApp Sandbox for a trial, or configure an approved WhatsApp sender for production.
2. Join the sandbox from your recipient phone using the instructions in Twilio's console. Production recipients must opt in.
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, and `TWILIO_WHATSAPP_TO` securely. Numbers must use `whatsapp:+` followed by the international number.
4. For proactive alerts outside WhatsApp's 24-hour customer-service window, create an approved WhatsApp content template and set `TWILIO_CONTENT_SID`. Configure template variable `1` as the price and `2` as the threshold. Free-form Body messages are only suitable when the applicable service window is open. Sandbox/template restrictions and Twilio fees apply.

The code submits messages through Twilio's HTTPS Messages API. An accepted or queued response does **not** prove handset delivery; check Twilio's delivery logs. No actual WhatsApp message has been sent during development.

## Run

```sh
cd /workspace/jobauto
.venv/bin/python monitor.py
```

Keep one instance running on an always-on host under a process supervisor for continuous monitoring. An interactive cloud task does not guarantee 24/7 uptime. Persistent browser/state files survive restarts only if their disk is retained; processes do not.

The first observed price below the threshold triggers an alert. Further low readings are suppressed until a successful reading at or above 126 rearms the monitor. `.runtime/state.json` preserves this state across restarts. Failed readings do not rearm it. Failed notification submissions are retried on later polls. A network timeout after Twilio accepts a message, or a crash before state is saved, can cause a duplicate; delivery is not exactly-once. Changing the threshold requires reviewing/removing prior alert state while stopped.

TLS verification remains enabled. Logs omit credentials and remote error bodies. On a failed check, use the error type, TER login status, and Twilio console to diagnose the cause. The system depends on TER page availability and may miss short price movements between polls. A changed page selector or stale quote may require maintenance.

## Alternative to Railway

Use a paid Render Background Worker with the included `render.yaml`. See [RENDER.md](RENDER.md) for deployment and private session configuration. It has not been live-tested on Render.
