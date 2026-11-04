import webpush from 'npm:web-push@3.6.7';

import { supportedEndpoint } from './push-rules.mjs';

export async function sendPriceAlerts(quote: {price: string; sell_price: string; observed_at: string}) {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'), privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return; // Price collection works before push is configured.
  webpush.setVapidDetails('https://diwas03.github.io/TER/', publicKey, privateKey);
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'};
  async function db(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(url + '/rest/v1/' + path, {method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Push storage unavailable');
    return response.status === 204 ? null : response.json();
  }
  // Keyset pagination avoids silently omitting subscribers at the REST row limit.
  let after = '';
  for (;;) {
    const rows = await db('push_alerts?enabled=eq.true&order=user_id&limit=100' + (after ? '&user_id=gt.' + after : ''));
    for (const row of rows) {
      if (!supportedEndpoint(row.subscription?.endpoint)) continue;
      for (const side of ['buy', 'sell']) {
        const value = side === 'buy' ? quote.price : quote.sell_price;
        const claimed = await db('rpc/claim_price_push', 'POST', {p_user: row.user_id, p_version: row.version, p_side: side, p_price: value});
        if (!claimed) continue;
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify({
            title: 'TER ' + side + ' target reached',
            body: `${side === 'buy' ? 'Buy' : 'Sell'} price Nu. ${value}; target ${side === 'buy' ? '≤' : '≥'} Nu. ${side === 'buy' ? row.buy_target : row.sell_target}.`,
            tag: 'ter-' + side, observed_at: quote.observed_at
          }), {TTL: 90, timeout: 10000});
          // Changing targets creates a new version, preserving the new settings.
          await db('push_alerts?user_id=eq.' + row.user_id + '&version=eq.' + row.version, 'PATCH', {[side + '_armed']: false});
        } catch (error) {
          if ([404, 410].includes((error as {statusCode?: number}).statusCode || 0)) {
            await db('push_alerts?user_id=eq.' + row.user_id + '&version=eq.' + row.version, 'PATCH', {enabled: false});
          }
          // Other failures remain armed; retry after the lease expires.
          console.error('Push delivery failed; subscription and credentials omitted');
        }
      }
    }
    if (rows.length < 100) break;
    after = rows[rows.length - 1].user_id;
  }
}
