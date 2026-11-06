import { supportedEndpoint } from './push-rules.mjs';

export async function handleTestPush(request, options) {
  const cors = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'};
  const reply = (status, error) => Response.json({ok: status === 202, ...(error ? {error} : {})}, {status, headers: cors});
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401);
  const {url,key,publicKey,privateKey}=options;
  const fetcher=options.fetch||fetch;
  if (!url || !key || !publicKey || !privateKey) return reply(503,'push_keys_missing');
  let stage='authentication';
  try {
    // Verify the caller with Auth; never trust an unverified JWT's user_id claim.
    const userResponse = await fetcher(url + '/auth/v1/user', {headers: {apikey: key, Authorization: authorization}, signal: AbortSignal.timeout(10000)});
    if (!userResponse.ok) return reply(401);
    const user = await userResponse.json();
    if (!/^[0-9a-f-]{36}$/i.test(user.id || '')) return reply(401);
    stage='storage';
    const saved = await fetcher(url + '/rest/v1/push_alerts?select=subscription&enabled=eq.true&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1', {
      headers: {apikey: key, Authorization: 'Bearer ' + key}, signal: AbortSignal.timeout(10000)
    });
    if (!saved.ok) return reply(502, 'push_storage_unavailable');
    const rows = await saved.json();
    if (!rows[0]?.subscription) return reply(404);
    if (!supportedEndpoint(rows[0].subscription.endpoint)) return reply(400);
    stage='delivery';
    await options.send(rows[0].subscription, JSON.stringify({title: 'TER test notification',
      body: 'This phone can receive TER price alerts. Your saved targets have not changed.',
      tag: 'ter-test', observed_at: new Date().toISOString()}));
    return reply(202);
  } catch (error) {
    const code = error?.statusCode;
    const safeCodes=['push_subscription_key_invalid','push_vapid_public_invalid','push_vapid_private_invalid','push_vapid_pair_mismatch','push_runtime_crypto_error','push_configuration_invalid','push_endpoint_invalid','push_network_error','push_subscription_expired','push_provider_auth_rejected','push_rate_limited','push_provider_unavailable'];
    const reason=safeCodes.includes(error?.code)?error.code:stage==='storage'?'push_storage_unavailable':stage==='authentication'?'push_auth_network_error':'push_delivery_failed';
    console.error('Test push failed',reason,code||'no-status');
    return reply(code === 404 || code === 410 ? 410 : 502,reason);
  }
}
