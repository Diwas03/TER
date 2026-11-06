import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../pwa/push-auth.js';
const config={url:'https://test.supabase.co',anonKey:'sb_publishable_test'},now=Date.now();
const storage=initial=>{const map=new Map(initial?[["ter-push-auth:"+config.url,JSON.stringify(initial)]]:[]);return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const session={access_token:'private-test-jwt',refresh_token:'private-test-refresh',user:{id:'test-user'},expires_in:3600};
test('disabled anonymous sign-in has a specific settings instruction; no key/session is exposed',async()=>{
 await assert.rejects(TERPushAuth.authenticate(config,{storage:storage(),now:()=>now,fetch:async()=>({ok:false,status:422,json:async()=>({code:'anonymous_provider_disabled',message:'private ignored value'})})}),e=>e.message.includes('Anonymous Sign-Ins is disabled')&&!e.message.includes('private ignored'));
});
test('anonymous registration persists a validated session and reuses it without new signups',async()=>{
 const local=storage();let requests=0;
 const options={storage:local,now:()=>now,fetch:async(url,init)=>{requests++;assert.ok(url.endsWith('/signup'));assert.deepEqual(JSON.parse(init.body),{data:{app:'ter-price-watch'}});return {ok:true,status:200,json:async()=>session};}};
 const first=await TERPushAuth.authenticate(config,options);assert.equal(first.user.id,'test-user');
 await TERPushAuth.authenticate(config,options);assert.equal(requests,1);
});
test('expired identities refresh instead of creating replacement subscriptions',async()=>{
 const local=storage({...session,expires_at:now/1000-1});
 await TERPushAuth.authenticate(config,{storage:local,now:()=>now,fetch:async(url,init)=>{assert.ok(url.includes('grant_type=refresh_token'));assert.equal(JSON.parse(init.body).refresh_token,session.refresh_token);return {ok:true,status:200,json:async()=>session};}});
});
test('rate limits and CAPTCHA are actionable; invalid sessions are not silently replaced',async()=>{
 assert.match(TERPushAuth.failure(429,'over_request_rate_limit').message,/rate limit/);
 assert.match(TERPushAuth.failure(400,'captcha_failed').message,/CAPTCHA/);
 assert.match(TERPushAuth.failure(400,'refresh_token_not_found').message,/Do not clear app data/);
 await assert.rejects(TERPushAuth.authenticate(config,{storage:storage(),fetch:async()=>{throw Error('private endpoint value');}}),e=>e.message.includes('Could not reach')&&!e.message.includes('private endpoint'));
});
