import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleTestPush} from '../supabase/functions/collect-prices/test-push.mjs';
const user='00000000-0000-0000-0000-000000000001';
const options={url:'https://project.supabase.co',key:'private-server-key',publicKey:'public-vapid',privateKey:'private-vapid'};
const request=()=>new Request('https://project.supabase.co/functions/v1/collect-prices/test-push',{method:'POST',headers:{Authorization:'Bearer device-session'},body:JSON.stringify({user_id:'someone-else'})});
test('test delivery requires a verified caller and never sends without authentication',async()=>{
 let sent=0,queried=0;
 const r=await handleTestPush(request(),{...options,fetch:async()=>{queried++;return {ok:false};},send:async()=>sent++});
 assert.equal(r.status,401);assert.equal(sent,0);assert.equal(queried,1);
 const missing=await handleTestPush(new Request('https://project.supabase.co'),{...options});assert.equal(missing.status,401);
});
test('test push reads only caller-owned subscription and never uses request user_id',async()=>{
 let sent=0;
 const r=await handleTestPush(request(),{...options,fetch:async(url)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:user})};
  assert.ok(url.includes('user_id=eq.'+user));assert.ok(!url.includes('someone-else'));
  return {ok:true,json:async()=>[{subscription:{endpoint:'https://fcm.googleapis.com/test'}}]};
 },send:async(sub,payload)=>{sent++;assert.equal(sub.endpoint,'https://fcm.googleapis.com/test');assert.match(JSON.parse(payload).title,/test notification/);}});
 assert.equal(r.status,202);assert.equal(sent,1);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
});
test('missing subscription and untrusted endpoints do not send',async()=>{
 for(const [rows,status]of [[[],404],[[{subscription:{endpoint:'https://127.0.0.1/private'}}],400]]){
  let sent=false;
  const r=await handleTestPush(request(),{...options,fetch:async url=>({ok:true,json:async()=>url.endsWith('/auth/v1/user')?{id:user}:rows}),send:async()=>{sent=true;}});
  assert.equal(r.status,status);assert.equal(sent,false);
 }
});

test('provider failures return only safe diagnosis codes, never remote bodies or secrets',async()=>{
 const r=await handleTestPush(request(),{...options,fetch:async url=>({ok:true,json:async()=>url.endsWith('/auth/v1/user')?{id:user}:[{subscription:{endpoint:'https://fcm.googleapis.com/test'}}]}),send:async()=>{throw Object.assign(Error('private authorization value'),{code:'push_provider_auth_rejected',statusCode:403});}});
 assert.equal(r.status,502);const payload=await r.json();assert.equal(payload.error,'push_provider_auth_rejected');assert.ok(!JSON.stringify(payload).includes('private authorization'));
});
