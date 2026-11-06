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

## Android: push sign-in error and test delivery

If registration says it cannot authenticate, open Supabase **Authentication → Sign In / Providers → Anonymous Sign-Ins**, enable it and save. New user sign-ups must also be allowed. This is a project setting; running SQL or deploying the function does not enable it. No TER login or password is involved.

The PWA now distinguishes disabled anonymous sign-in, disabled sign-ups, CAPTCHA requirements, invalid public project keys, rate limits and failed session refresh. It refreshes existing private identities rather than silently creating duplicate subscriptions, and serializes refreshes across tabs where browser Web Locks is supported. It authenticates before subscribing so a failed sign-in does not leave a new unregistered push subscription.

After both new Pages and collector workflows succeed:

1. Close/reopen the Android PWA and tap **Enable phone push**. Require registration confirmation.
2. Tap **Send test notification**. The backend validates your user session and sends only to that user's saved subscription; it never trusts a request-supplied user ID or endpoint. The test does not change price targets or alert rearming state.
3. If “Test submitted” appears, look for the notification in Android's notification shade. Provider acceptance is not proof Android displayed it. Check Chrome/PWA notification permission, Android app/site notifications and Do Not Disturb if it is absent.
4. If sign-in still fails, share only the new message/HTTP status, never tokens. CAPTCHA requirements need a compatible CAPTCHA flow and cannot be solved by repeatedly retrying. Invalid refresh sessions require identity repair; do not clear app data blindly because an old remote subscription may remain.

No new SQL is required if push-alerts.sql has already been applied. Hosted Auth configuration and actual handset delivery require verification after deployment. The tests use controlled responses and do not enable Anonymous Sign-Ins remotely.

## Server-side 502 after successful registration

Successful browser registration does not verify the server can encrypt/sign/send a push. The sender now uses native Web Crypto for RFC 8291 aes128gcm payload encryption and RFC 8292 ES256 VAPID signing, then native fetch for HTTPS transport. It has no Node crypto/HTTPS runtime dependency. Existing VAPID keys and subscriptions are retained. Payload encryption has been checked against the independent http_ece decoder; signatures have been verified separately.

After both workflows deploy the new main commit, reopen the app and use **Send test notification**. No new SQL or key rotation is needed. On failure the UI and logs now distinguish invalid key/subscription configuration, provider authentication rejection, expired subscription, provider rate limit, network failure, subscription-storage failure and Auth connectivity. Only safe codes/statuses are returned; keys, endpoints, remote bodies and authorization headers are omitted.

A native transport change is not evidence of hosted delivery: require a notification on the real phone. If push keys do not match the registered application server key, restore the correct key pair or deliberately rotate/re-register affected devices after diagnosis. Do not delete working VAPID keys merely to retry a network failure.

## Key-specific diagnostics

The sender accepts surrounding whitespace/quotes, URL-safe or standard base64 padding, and restores leading zero bytes in short P-256 private scalars. The normalized private key must still verify against the existing public key. This changes encoding only and does not rotate keys or bypass signature validation. New key generation always emits a 32-byte private scalar.

Test failures distinguish `push_vapid_public_invalid`, `push_vapid_private_invalid`, `push_vapid_pair_mismatch`, `push_subscription_key_invalid` and `push_runtime_crypto_error`. Subscription-key errors require disabling/re-enabling the phone subscription. Server key errors require restoring the matching server key material; they are not fixed by Android permissions or the Supabase public project key. Never share private keys in chat.

The native request generator was also exercised in a local Deno runtime, in addition to Node Web Crypto and independent payload/signature checks. This does not inspect deployed secrets or prove delivery from the hosted project. After both workflows succeed, reopen the app and retry the test; report only the new error text if it still fails.
