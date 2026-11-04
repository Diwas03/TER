import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchQuote} from '../supabase/functions/collect-prices/fetch-quote.mjs';
test('current quote uses the public upstream without credentials or cache',async()=>{
 const stamp=new Date().toISOString();
 const q=await fetchQuote(async(url,options)=>{
  assert.equal(url,'https://api.ter.bt/prices');assert.equal(options.cache,'no-store');
  assert.deepEqual(options.headers,{Accept:'application/json'});
  return {ok:true,json:async()=>({prices:[{product_symbol:'TERBTN',ask_price:1254398,bid_price:1223393,tradeable:true,effective_at:stamp}]})};
 });
 assert.equal(q.price,'125.4398');assert.equal(q.sell_price,'122.3393');assert.equal(q.observed_at,stamp);
});
test('upstream error or stale quote is not relabeled fresh',async()=>{
 await assert.rejects(fetchQuote(async()=>({ok:false})));
 await assert.rejects(fetchQuote(async()=>({ok:true,json:async()=>({prices:[{product_symbol:'TERBTN',ask_price:1254398,bid_price:1223393,tradeable:true,effective_at:new Date(Date.now()-61000).toISOString()}]})})));
});
