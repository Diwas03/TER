import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../pwa/alerts.js';
const {evaluate}=globalThis.TERAlerts;
const now=Date.now(),stamp=new Date(now).toISOString();
const quote=(buy,sell,time=stamp)=>({price:buy,sell_price:sell,observed_at:time});
test('buy <= and sell >= include equality; repeated readings suppress duplicate alerts',()=>{
 let result=evaluate({buy:125,sell:128},quote(125,128),now);
 assert.deepEqual(result.hits.map(h=>h.side),['buy','sell']);
 result=evaluate(result.state,quote(124,129),now);assert.equal(result.hits.length,0);
 result=evaluate(result.state,quote(126,127),now);assert.equal(result.hits.length,0);
 result=evaluate(result.state,quote(125,128),now);assert.equal(result.hits.length,2);
});
test('stale, missing and future prices never trigger or rearm',()=>{
 const state={buy:125,buyTriggered:true,sell:128,sellTriggered:true};
 for(const q of [null,quote(126,127,new Date(now-121000).toISOString()),quote(126,127,new Date(now+11000).toISOString())]){
  const r=evaluate(state,q,now);assert.equal(r.hits.length,0);assert.deepEqual(r.state,state);
 }
 assert.equal(evaluate({sell:128},quote(125,null),now).hits.length,0);
});
test('disabled targets and out-of-order quotes do not produce alerts',()=>{
 assert.equal(evaluate({},quote(124,129),now).hits.length,0);
 const state={buy:125,buyTriggered:true,buySeen:stamp};
 const r=evaluate(state,quote(126,127,new Date(now-1000).toISOString()),now);
 assert.equal(r.state.buyTriggered,true);
});

import {supportedEndpoint} from '../supabase/functions/collect-prices/push-rules.mjs';
test('only trusted HTTPS push services can receive server requests',()=>{
 for(const url of ['https://fcm.googleapis.com/fcm/send/test','https://web.push.apple.com/test','https://updates.push.services.mozilla.com/wpush/test'])assert.equal(supportedEndpoint(url),true);
 for(const url of ['http://fcm.googleapis.com/test','https://127.0.0.1/test','https://fcm.googleapis.com.evil.example/test','https://user:secret@fcm.googleapis.com/test','https://fcm.googleapis.com:8443/test'])assert.equal(supportedEndpoint(url),false);
});
