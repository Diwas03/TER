import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../pwa/chart-model.js';
const {prepare,segments,mergeLegacy}=globalThis.TERChart;
const now=Date.now();
const row=(minutes,buy=125,sell=122)=>({bucket:new Date(now-minutes*60000).toISOString(),buy_price:buy,sell_price:sell,buy_low:buy,buy_high:buy,sell_low:sell,sell_high:sell,samples:2});
test('ranges include only 1, 2 or 24 hours; both prices share a scale',()=>{
 const points=[row(30),row(90),row(180),row(1500)];
 assert.equal(prepare(points,1,now).rows.length,1);
 assert.equal(prepare(points,2,now).rows.length,2);
 const day=prepare(points,24,now);assert.equal(day.rows.length,3);assert.equal(day.low,122);assert.equal(day.high,125);assert.equal(day.samples,6);
 assert.throws(()=>prepare(points,7,now));
});
test('missing sell prices are not invented or connected across gaps',()=>{
 const rows=[row(1,125,122),row(.5,125,null),row(0,125,122)];
 const m=prepare(rows,1,now);assert.equal(m.series[1].points.length,2);
 assert.equal(segments(m.rows,'sell',30000).length,2);
 assert.equal(segments(m.rows,'buy',30000).length,1);
 assert.equal(segments([row(20),row(0)],'buy',30000).length,2);
});
test('legacy history merges by timestamp without double counting observations',()=>{
 const bucket=new Date(now).toISOString();
 const rows=mergeLegacy([{bucket,price:'125',low:'124',high:'126',samples:4}],[{bucket,price:'122',low:'121',high:'123',samples:4}]);
 const m=prepare(rows,1,now);assert.equal(m.samples,4);assert.equal(m.step,300000);assert.equal(m.rows[0].sell_price,122);
});

test('raw fallback aggregates both prices and preserves missing sell data',()=>{
 const points=globalThis.TERChart.aggregate([
  {observed_at:new Date(now-1000).toISOString(),price:'125',sell_price:'122'},
  {observed_at:new Date(now-1000).toISOString(),price:'127',sell_price:null},
  {observed_at:new Date(now-7200000).toISOString(),price:'999',sell_price:'900'}
 ],1,now);
 assert.equal(points.length,1);assert.equal(points[0].buy_price,126);assert.equal(points[0].sell_price,122);assert.equal(points[0].samples,2);assert.equal(points[0].buy_low,125);assert.equal(points[0].buy_high,127);
});
