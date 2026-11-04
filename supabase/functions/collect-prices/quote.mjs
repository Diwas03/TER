export function parseQuote(payload, now = Date.now()) {
  if (!Array.isArray(payload?.prices)) throw new Error('Missing price list');
  const matches = payload.prices.filter(q => q?.product_symbol === 'TERBTN');
  if (matches.length !== 1) throw new Error('Expected one TERBTN quote');
  const quote = matches[0], stamp = Date.parse(quote.effective_at);
  if (!Number.isSafeInteger(quote.ask_price) || quote.ask_price <= 0 || quote.tradeable !== true) throw new Error('Invalid ask price');
  if (typeof quote.effective_at !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(quote.effective_at) || !Number.isFinite(stamp) || now-stamp > 60000 || stamp-now > 10000) throw new Error('Invalid quote time');
  // Keep the API's integer precision and the confirmed four-decimal scale.
  return {price: (quote.ask_price / 10000).toFixed(4), observed_at: new Date(stamp).toISOString()};
}
