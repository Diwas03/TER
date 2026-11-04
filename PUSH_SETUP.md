# Buy/sell prices and phone push alerts

Buy = TERBTN ask_price / 10,000 (what you pay). Sell = TERBTN bid_price / 10,000 (what you receive). Historical rows have no sell value; it is not invented/backfilled. Existing history chart remains explicitly a buy-price chart.

## Activate the upgrade in this order

1. Supabase SQL Editor: run `supabase/add-sell-price.sql`. This adds a nullable column without deleting old prices.
2. Run `supabase/push-alerts.sql` in SQL Editor. It creates private per-user subscriptions and atomic alert claims. Existing public-price permissions remain unchanged. Only service_role can claim deliveries.
3. Supabase Authentication → Sign In / Providers (or Settings): enable **Anonymous Sign-Ins**. This lets the PWA create a private identity without a password. This is different from the public anon API key. Review your Auth quotas and abuse protection if sharing the app broadly; if your project requires CAPTCHA, a compatible CAPTCHA UI must be added before anonymous registration can work.
4. GitHub Actions → **Deploy Supabase price collector** → start a NEW run on main. Existing SUPABASE_ACCESS_TOKEN and COLLECTOR_SECRET are reused. The workflow generates VAPID push keys once if missing and retains existing keys on later deployments. It never prints the private key. Push setup requires the current CLI's JSON secrets listing. Do not rotate/delete VAPID keys casually; doing so invalidates existing subscriptions.
5. Wait for the Pages deployment to finish, close/reopen the PWA, and refresh it. Confirm both prices appear. Supabase collection remains once per minute; app refresh remains 15 seconds.
6. Save buy-at-or-below and/or sell-at-or-above targets in the app. Empty targets disable that side. Click **Enable background push**, allow notifications, and wait for registration confirmation. The public push key is loaded automatically from the collector. Never enter the private key in the PWA.

On iPhone/iPad use an updated iOS version supporting Web Push (16.4+) and install via Safari Share → Add to Home Screen; open the installed app before enabling push. Android Chrome supports push subject to browser/OS permissions. OS battery restrictions, notification settings, network outages, provider delays and quota limits can delay/block delivery. This is not an alarm service or guarantee of observing every market move.

## Behavior

- Buy alerts when observed buy <= target; sell alerts when observed sell >= target. Equality is included. Initial fresh matched observation can alert.
- Each side alerts once while its condition stays true; a subsequent fresh observation outside the condition rearms it.
- Saving targets rearms that device. Settings persist per Supabase project in local storage; background settings are synced to that device's anonymous identity. Allow the save to finish and check the push status.
- If background push is enabled, local notifications are suppressed to avoid duplicates. Without push, in-app alerts work only while open and connected. No alert triggers from cached or stale responses.
- Delivery is attempted by the scheduled collector after it saves a valid fresh quote, even if the app is closed. Supabase must stay active. A successful push-service response does not prove the phone displayed it.
- Failed transient sends remain armed for a later retry after a two-minute lease; expired subscriptions are disabled. A crash after send but before acknowledgement can cause a duplicate. Browser notification tags collapse outstanding alerts by side. No exactly-once delivery is promised.
- Stop alerts using **Disable alerts** (clears targets and syncs) or **Disable background push** (removes the subscription server-side). Check confirmation before closing. Clearing browser data loses the anonymous identity and local controls; revoke notification permission in browser settings if needed. The old database row can be removed by its owner/admin.
- Anonymous user credentials and refresh tokens stay on the device. `push_alerts` RLS permits only that user's row. Subscriptions/targets are not public. Endpoint allowlisting prevents arbitrary private-network destinations. Protect the existing collector secret and deployment token.

## Verification

After deployment, require new rows with `sell_price` populated, then set an intentional test target that matches the current quote (e.g. buy target slightly above buy) and check a real phone notification. This triggers a real notification. Restore your intended targets afterward. Verify both directions/rearming if relying on them. A missing push table or malformed keys does not stop quote storage; collector logs report push failures separately.

Local tests cover price scaling, invalid bid/ask and stale quotes, target direction/equality, rearming, missing prices and duplicate suppression. Browser tests use mocked Supabase data. Supabase migrations, RLS, Deno deployment and actual device push must still be validated in the hosted project. Large subscriber counts can exceed function execution quotas; this version processes subscribers sequentially in pages, appropriate for a small personal dashboard.
