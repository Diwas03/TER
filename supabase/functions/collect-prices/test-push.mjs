import { supportedEndpoint } from './push-rules.mjs';

export async function handleTestPush(request, options) {
  const cors = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'};
  const reply = (status) => Response.json({ok: status === 202}, {status, headers: cors});
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401);
  const {url,key,publicKey,privateKey}=options;
  const fetcher=options.fetch||fetch;
  if (!url || !key || !publicKey || !privateKey) return reply(503);
  try {
    // Verify the caller with Auth; never trust an unverified JWT's user_id claim.
    const userResponse = await fetcher(url + '/auth/v1/user', {headers: {apikey: key, Authorization: authorization}, signal: AbortSignal.timeout(10000)});
    if (!userResponse.ok) return reply(401);
    const user = await userResponse.json();
    if (!/^[0-9a-f-]{36}$/i.test(user.id || '')) return reply(401);
    const saved = await fetcher(url + '/rest/v1/push_alerts?select=subscription&enabled=eq.true&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1', {
      headers: {apikey: key, Authorization: 'Bearer ' + key}, signal: AbortSignal.timeout(10000)
    });
    if (!saved.ok) return reply(502);
    const rows = await saved.json();
    if (!rows[0]?.subscription) return reply(404);
    if (!supportedEndpoint(rows[0].subscription.endpoint)) return reply(400);
    await options.send(rows[0].subscription, JSON.stringify({title: 'TER test notification',
      body: 'This phone can receive TER price alerts. Your saved targets have not changed.',
      tag: 'ter-test', observed_at: new Date().toISOString()}));
    return reply(202);
  } catch (error) {
    const code = error?.statusCode;
    console.error('Test push failed', code || 'network/storage error');
    return reply(code === 404 || code === 410 ? 410 : 502);
  }
}
