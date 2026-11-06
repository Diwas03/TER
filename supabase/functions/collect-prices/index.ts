import { fetchQuote } from './fetch-quote.mjs';
import { sendPriceAlerts, testPricePush } from './push.ts';

Deno.serve(async (request: Request) => {
  if (new URL(request.url).pathname.endsWith('/test-push')) {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type'}});
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
    return testPricePush(request);
  }
  if (request.method === 'GET' && new URL(request.url).pathname.endsWith('/quote')) {
    const headers = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store, max-age=0'};
    try {
      // Fixed public upstream only; no login, writes, push sends or collector secret.
      return Response.json({quote: await fetchQuote()}, {headers});
    } catch {
      return Response.json({error: 'Current TER quote unavailable'}, {status: 502, headers});
    }
  }
  if (request.method === 'GET') return Response.json({publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || null}, {headers: {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'}});
  if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
  const secret = Deno.env.get('COLLECTOR_SECRET');
  if (!secret || secret.length < 32) return new Response('Collector not configured', {status: 503});
  const supplied = request.headers.get('Authorization') || '';
  // Compare fixed-size digests without early exit on the first different byte.
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [actual, expected] = await Promise.all([digest(supplied), digest('Bearer ' + secret)]);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  if (difference !== 0) return new Response('Unauthorized', {status: 401});
  try {
    const quote = await fetchQuote();
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Missing database configuration');
    // Built-in Supabase service-role binding stays server-side.
    const saved = await fetch(url + '/rest/v1/price_observations', {
      method: 'POST', headers: {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal'},
      body: JSON.stringify(quote), signal: AbortSignal.timeout(10000)
    });
    if (saved.status !== 201) throw new Error('History write failed');
    try { await sendPriceAlerts(quote); } catch { console.error('Push processing failed; quote saved'); }
    return Response.json({ok: true, ...quote});
  } catch {
    // Remote bodies/headers can contain sensitive details; never return them.
    console.error('Price collection failed; check TER API availability and database schema');
    return Response.json({ok: false, error: 'Collection failed'}, {status: 502});
  }
});
