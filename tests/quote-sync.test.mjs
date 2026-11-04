import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../pwa/quote-sync.js';
const {canDisplay,currentQuote}=globalThis.TERQuoteSync;
const now=Date.now(),quote=(age=0)=>({price:'124.6671',sell_price:'121.5811',observed_at:new Date(now-age).toISOString()});
test('live endpoint validates both prices, source timestamp and freshness',()=>{
 assert.deepEqual(currentQuote({quote:quote()},now),quote());
 for(const bad of [quote(61000),quote(-11000),{...quote(),sell_price:null},{...quote(),sell_price:'125'},{...quote(),price:'NaN'},null])assert.throws(()=>currentQuote({quote:bad},now));
 assert.throws(()=>currentQuote({publicKey:'not-a-price'},now));
});
test('old responses cannot replace newer readings; future corrupt rows cannot freeze live updates',()=>{
 assert.equal(canDisplay(quote(),quote(15000),now),false);
 assert.equal(canDisplay(quote(15000),quote(),now),true);
 assert.equal(canDisplay(quote(-600000),quote(),now),true);
 assert.equal(canDisplay(null,quote(-11000),now),false);
 assert.equal(canDisplay(null,{...quote(),sell_price:null},now),true);
});
