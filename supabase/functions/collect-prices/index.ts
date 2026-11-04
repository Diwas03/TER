import { parseQuote } from './quote.mjs';

Deno.serve(async (request: Request) => {
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
    const api = await fetch('https://api.ter.bt/prices', {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(10000)});
    if (!api.ok) throw new Error('TER request failed');
    const quote = parseQuote(await api.json());
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Missing database configuration');
    // Built-in Supabase service-role binding stays server-side.
    const saved = await fetch(url + '/rest/v1/price_observations', {
      method: 'POST', headers: {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal'},
      body: JSON.stringify(quote), signal: AbortSignal.timeout(10000)
    });
    if (saved.status !== 201) throw new Error('History write failed');
    return Response.json({ok: true, ...quote});
  } catch {
    // Remote bodies/headers can contain sensitive details; never return them.
    console.error('Price collection failed; check TER API availability and database schema');
    return Response.json({ok: false, error: 'Collection failed'}, {status: 502});
  }
});
