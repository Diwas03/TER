// RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID using Web Crypto only.
const utf8=value=>new TextEncoder().encode(value);
function concat(...parts){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;}
export function decode64(value){
 if(typeof value!=='string')throw Error('Invalid base64url');
 value=value.trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1).trim();
 if(!/^[A-Za-z0-9_+\/-]+={0,2}$/.test(value))throw Error('Invalid base64url');
 value=value.replace(/=+$/,'');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
}
function invalid(code){return Object.assign(Error(code),{code});}
function keyBytes(value,code){try{return decode64(value);}catch{throw invalid(code);}}

export function encode64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function hkdf(material,salt,info,length){const key=await crypto.subtle.importKey('raw',material,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));}
export async function makePushRequest(subscription,payload,options){
 const receiver=keyBytes(subscription.keys?.p256dh,'push_subscription_key_invalid'),auth=keyBytes(subscription.keys?.auth,'push_subscription_key_invalid');
 const publicKey=keyBytes(options.publicKey,'push_vapid_public_invalid'),rawPrivate=keyBytes(options.privateKey,'push_vapid_private_invalid');
 if(receiver.length!==65||receiver[0]!==4||auth.length!==16)throw invalid('push_subscription_key_invalid');
 if(publicKey.length!==65||publicKey[0]!==4)throw invalid('push_vapid_public_invalid');
 if(rawPrivate.length<1||rawPrivate.length>32)throw invalid('push_vapid_private_invalid');
 // Node ECDH exports can omit leading zero bytes. Restore the fixed-width scalar.
 const privateKey=new Uint8Array(32);privateKey.set(rawPrivate,32-rawPrivate.length);
 const plaintext=utf8(payload);if(plaintext.length>3993)throw Error('Push payload too large');
 const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const sender=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
 let receiverKey;try{receiverKey=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);}catch(error){throw invalid(error.name==='NotSupportedError'?'push_runtime_crypto_error':'push_subscription_key_invalid');}
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey},ephemeral.privateKey,256));
 const material=await hkdf(shared,auth,concat(utf8('WebPush: info\0'),receiver,sender),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(material,salt,utf8('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(material,salt,utf8('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,concat(plaintext,new Uint8Array([2]))));
 const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096);
 const body=concat(salt,rs,new Uint8Array([sender.length]),sender,ciphertext);
 const jwk={kty:'EC',crv:'P-256',x:encode64(publicKey.slice(1,33)),y:encode64(publicKey.slice(33,65)),d:encode64(privateKey),ext:true};
 let signing;try{signing=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);}catch(error){if(error.name==='NotSupportedError')throw invalid('push_runtime_crypto_error');throw invalid('push_vapid_pair_mismatch');}
 const header=encode64(utf8(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const claims=encode64(utf8(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(Date.now()/1000)+43200,sub:'https://diwas03.github.io/TER/'})));
 const data=utf8(header+'.'+claims);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signing,data);
 const verify=await crypto.subtle.importKey('raw',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verify,signature,data))throw invalid('push_vapid_pair_mismatch');
 return {endpoint:subscription.endpoint,method:'POST',headers:{TTL:'90',Urgency:'high','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:'vapid t='+header+'.'+claims+'.'+encode64(signature)+', k='+encode64(publicKey)},body};
}
