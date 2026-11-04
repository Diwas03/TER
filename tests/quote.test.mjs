import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseQuote} from '../supabase/functions/collect-prices/quote.mjs';
const now = Date.parse('2026-11-04T14:04:21Z');
const quote = {product_symbol:'TERBTN',ask_price:1246671,bid_price:1215811,tradeable:true,effective_at:new Date(now).toISOString()};
test('selects BTN ask and preserves source timestamp',()=>assert.deepEqual(parseQuote({prices:[{...quote,product_symbol:'TERUSD'},quote]},now),{price:'124.6671',observed_at:new Date(now).toISOString()}));
test('rejects malformed, nontradeable, stale, future and duplicate quotes',()=>{
  for(const change of [{ask_price:0},{ask_price:true},{ask_price:'1246671'},{tradeable:false},{effective_at:new Date(now-61000).toISOString()},{effective_at:new Date(now+11000).toISOString()},{effective_at:'2026-11-04T14:04:21'}])assert.throws(()=>parseQuote({prices:[{...quote,...change}]},now));
  for(const prices of [[],[quote,quote]])assert.throws(()=>parseQuote({prices},now));
});
