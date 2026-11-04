> Current setup: continuous collection runs in Supabase. The legacy GitHub monitor workflow is now manual-only to avoid redundant scheduled jobs and Actions usage. Scheduled instructions below describe the older alternative; use DEPLOYMENT.md and DASHBOARD_UPGRADE.md for the current system.

# Run TER checks inside this GitHub repository

This option uses GitHub Actions, without Railway, Render, or an always-on PC. It is a **scheduled one-time check about every five minutes**, not the 15-second continuous monitor. GitHub can delay or drop scheduled runs, so short price dips can be missed. No hosting account is required, but GitHub Actions/cache quotas and account policies apply; check billing and keep paid overages disabled if you need zero spending. Private repositories have limited included runner minutes. WhatsApp through Twilio may still incur fees.

The workflow is added but **automatic checks are disabled by default** until the repository variable `MONITOR_ENABLED` is `true`. No live authenticated TER check or WhatsApp delivery has been verified.

## 1. Export a private TER login session

Download/clone the repository on Windows. With Python 3.12+ installed, open PowerShell in the repository folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\Export-Session.ps1
```

Enter CID, password, and OTP yourself in the opened TER browser. Navigate to the dashboard containing Live TER Prices and wait for a live quote. Then press Enter in PowerShell. This creates `.runtime\cloud-session.json`. Never upload that file to GitHub as a repository file or paste it in chat. It grants account access; treat it like a password.

## 2. Configure repository secrets

In `Diwas03/jobauto`, open **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Add:

| Secret | Value |
| --- | --- |
| `TER_BROWSER_SESSION_JSON` | Complete private contents of `.runtime\cloud-session.json` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_FROM` | Approved sender, formatted `whatsapp:+internationalnumber` |
| `TWILIO_WHATSAPP_TO` | Your opted-in phone, same format |
| `TWILIO_CONTENT_SID` | Approved proactive WhatsApp template; variable 1 = price, variable 2 = threshold |

Follow DEPLOY.md for Twilio sender/template setup. Use repository **secrets**, never ordinary variables, for session JSON and credentials. Do not share them in issues or workflow logs. Anyone with trusted workflow-editing access could use these credentials; restrict collaborators and branch access accordingly.

## 3. Configure the Buy price field

In **Settings → Secrets and variables → Actions → Variables**, add:

- `TER_URL`: the full `https://ter.bt/...` page URL containing the logged-in Live TER Prices card.
- `TER_PRICE_SELECTOR`: a unique CSS selector for the numeric **Buy amount in the TER/BTN card**. While logged in on Windows, use F12's element picker on that amount and Copy → Copy selector. Do not select the wallet balance, INR/USD price, Sell amount, or whole card.

The screenshot alone cannot determine this DOM selector. It must be verified on the live page. Keep `MONITOR_ENABLED` absent/false until the manual test works.

## 4. Test manually, then enable

1. Open **Actions → TER price alert → Run workflow**, select branch `main`, leave **dry_run** checked, and run it.
2. Inspect the **Check TER buy price** log. Require a successful observation that matches the live BTN buy price. This mode sends no WhatsApp and does not change suppression state.
3. Run manually with **dry_run** unchecked after configuring WhatsApp. The current threshold is **strictly below Nu. 126**. If the observed price is not below 126, no alert is expected. Verify a real delivered alert before relying on the service; acceptance by Twilio is not proof of handset delivery.
4. Set repository variable `MONITOR_ENABLED` to `true` to enable future scheduled jobs. Your PC can now be off. Set it to `false` or disable the workflow to stop scheduled checks.

Optionally configure `DASHBOARD_URL` as a repository variable and `MONITOR_API_TOKEN` as a secret to update the Vercel dashboard. Its current 60-second stale badge was designed for continuous mode; five-minute scheduled checks will often show stale between runs. Actions logs are the source of truth for this workflow.

## Important limits

- A fresh GitHub runner is created per check. TER may reject a transferred session or frequent IP changes. If that happens, this method cannot provide unattended checks without a TER-supported API or login method. It does not bypass OTP.
- Sessions can expire. Export a new private session after signing in with OTP and update the repository secret. The code does not persist refreshed session tokens between jobs.
- Only `.runtime/state.json` is cached to suppress repeated alerts; browser sessions and credentials are never cached or uploaded as artifacts. Cache expiry/eviction or failed saves can cause repeat alerts. This is best-effort state, not durable exactly-once delivery.
- Scheduled jobs run from the default branch. Ensure `main` is the default branch, Actions is enabled, and the workflow is committed there. GitHub may disable schedules in inactive public repositories; check the Actions tab periodically.
- These checks can miss price changes between observations, stop when usage limits are reached, or fail during outages. No separate login-expiry notification is implemented.

See `.github/workflows/ter-alert.yml` for the complete configuration. It runs no trading operations.

## Troubleshoot a failed page load

A missing cache is normal on the first run. Dependency-install warnings are not a failed price check. The price-reading step now logs `TER page response: HTTP ...` without private URLs, cookies, session data, or response bodies.

- HTTP 401: check or renew the login session.
- HTTP 403: TER refused the request. This could be the URL, session restrictions, or cloud-runner access policy; the status does not establish which. Do not change fingerprints or bypass site protections.
- HTTP 404: correct `TER_URL` using the exact logged-in page address.
- HTTP 429: pause automatic checks and allow the rate limit to recover.
- HTTP 5xx: the site or its gateway failed; retry after it recovers.
- HTTP 200 followed by a timeout: check whether the session opens the login page instead of prices, then verify the price selector.

After a code update, start a **new Run workflow** on `main` with `dry_run` checked. Rerunning an old failed job can reuse its old commit and old diagnostics. Share only the status/error lines, not private session contents.
