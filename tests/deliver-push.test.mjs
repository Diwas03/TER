import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliverPush} from '../supabase/functions/collect-prices/deliver-push.mjs';
import {makePushRequest,encode64} from '../supabase/functions/collect-prices/web-push-request.mjs';
import {createECDH,randomBytes,createPublicKey,verify} from 'node:crypto';
function setup(){const receiver=createECDH('prime256v1');receiver.generateKeys();const vapid=createECDH('prime256v1');vapid.generateKeys();return {subscription:{endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},options:{publicKey:vapid.getPublicKey().toString('base64url'),privateKey:vapid.getPrivateKey().toString('base64url')},receiver};}
test('native Web Crypto generates encrypted payload and independently verified VAPID JWT',async()=>{
 const {subscription,options}=setup();const request=await makePushRequest(subscription,'private test payload',options);
 assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.ok(!Buffer.from(request.body).includes(Buffer.from('private test payload')));
 const jwt=request.headers.Authorization.match(/t=([^,]+)/)[1],parts=jwt.split('.');
 const pub=Buffer.from(options.publicKey,'base64url');const key=createPublicKey({key:{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33,65).toString('base64url')},format:'jwk'});
 assert.ok(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
 assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://fcm.googleapis.com');
});
test('native transport does not follow redirects; provider failures have safe specific codes',async()=>{
 const fixture=setup();let sent=false;
 await deliverPush(fixture.subscription,'payload',{...fixture.options,fetch:async(url,options)=>{sent=true;assert.equal(options.redirect,'error');assert.equal(options.headers.Urgency,'high');return {ok:true,status:201};}});assert.ok(sent);
 for(const [status,code]of [[403,'push_provider_auth_rejected'],[410,'push_subscription_expired'],[429,'push_rate_limited'],[503,'push_provider_unavailable']])await assert.rejects(deliverPush(fixture.subscription,'payload',{...fixture.options,fetch:async()=>({ok:false,status})}),e=>e.code===code&&e.statusCode===status);
 await assert.rejects(deliverPush(fixture.subscription,'payload',{...fixture.options,fetch:async()=>{throw Error('private endpoint details');}}),e=>e.code==='push_network_error'&&!e.message.includes('private endpoint'));
});
test('mismatched VAPID keys fail before provider access',async()=>{
 const a=setup(),b=setup();let sent=false;
 await assert.rejects(deliverPush(a.subscription,'payload',{...a.options,privateKey:b.options.privateKey,fetch:async()=>{sent=true;return {ok:true};}}),e=>e.code==='push_vapid_pair_mismatch');assert.equal(sent,false);
});

test('existing padded/quoted key encodings and short private scalars normalize without rotation',async()=>{
 const fixture=setup(),vapid=createECDH('prime256v1');vapid.setPrivateKey(Buffer.from([1]));
 const pub=vapid.getPublicKey().toString('base64url');
 const request=await makePushRequest(fixture.subscription,'compatibility-check',{publicKey:' "'+pub+'=" ',privateKey:' AQ== '});
 assert.ok(request.headers.Authorization.endsWith('k='+pub));
});
test('invalid server and subscription keys are distinguished safely',async()=>{
 const fixture=setup();
 for(const [subscription,options,code]of [
  [fixture.subscription,{...fixture.options,publicKey:'invalid'},'push_vapid_public_invalid'],
  [fixture.subscription,{...fixture.options,privateKey:'not a key'},'push_vapid_private_invalid'],
  [{...fixture.subscription,keys:{p256dh:'invalid',auth:'invalid'}},fixture.options,'push_subscription_key_invalid']
 ])await assert.rejects(deliverPush(subscription,'payload',options),e=>e.code===code);
});
