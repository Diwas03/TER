// Each device gets an anonymous Supabase Auth identity. RLS isolates its subscription.
(async()=>{
 const $=id=>document.getElementById(id);
 const stored=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
 const settings=()=>stored('ter-connection')||window.TER_CONFIG;
 let locked=false,queued=null;
 const status=text=>{$('push-status').textContent=text;};
 $('vapid-key').value=stored('ter-vapid:'+settings()?.url)||window.TER_CONFIG.vapidPublicKey||'';
 async function auth(c,force=false){return TERPushAuth.authenticate(c,{force});}

 function decodeKey(value){const base64=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(base64+'='.repeat((4-base64.length%4)%4)),c=>c.charCodeAt(0));}
 async function save(enabled){
   const c=settings();if(!TERPublicConfig.valid(c))throw Error('Save your matching Supabase project URL and public key in Connection settings first.');
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Push unavailable. On iPhone use an installed Home Screen PWA.');
   if(enabled && Notification.permission!=='granted' && await Notification.requestPermission()!=='granted')throw Error('Allow notifications in your browser settings.');
   const session=await auth(c);
   const reg=await navigator.serviceWorker.ready;
   let subscription=await reg.pushManager.getSubscription();
   if(enabled){
     let value=$('vapid-key').value.trim();
     if(!value){const response=await fetch(c.url+'/functions/v1/collect-prices',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Push setup not deployed yet. Run the collector deployment workflow.');value=(await response.json()).publicKey||'';$('vapid-key').value=value;}
     const key=decodeKey(value);
     if(key.length!==65)throw Error('Enter the public VAPID key (not the private key).');
     if(subscription){const existing=subscription.options.applicationServerKey;if(existing&&Array.from(new Uint8Array(existing)).join()!==Array.from(key).join()){await subscription.unsubscribe();subscription=null;}}
     subscription=subscription||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
     localStorage.setItem('ter-vapid:'+c.url,JSON.stringify(value));
   }
   const target=stored('ter-targets:'+c.url)||{};
   const response=await fetch(c.url+'/rest/v1/push_alerts'+(enabled?'?on_conflict=user_id':'?user_id=eq.'+session.user.id),{
     method:enabled?'POST':'DELETE',headers:{apikey:c.anonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
     body:enabled?JSON.stringify({user_id:session.user.id,subscription:subscription.toJSON(),buy_target:target.buy||null,sell_target:target.sell||null,enabled:true,version:crypto.randomUUID(),buy_armed:true,sell_armed:true,buy_lease:'1970-01-01T00:00:00Z',sell_lease:'1970-01-01T00:00:00Z'}):undefined,signal:AbortSignal.timeout(15000)
   });
   if(!response.ok)throw Error('Could not save push settings ('+response.status+'). Run push-alerts.sql and check Anonymous Sign-Ins.');
   if(!enabled&&subscription)await subscription.unsubscribe();
   localStorage.setItem('ter-push-enabled:'+c.url,JSON.stringify(enabled));
   status(enabled?'Background push registered. Requires deployed push keys and an active collector. Saving targets syncs this device.':'Background push disabled.');
 }
 async function action(enabled){if(locked){queued=enabled;return;}locked=true;status(enabled?'Signing in and registering this phone…':'Disabling push…');try{await save(enabled);}catch(e){status(e.message);}finally{locked=false;if(queued!==null){const next=queued;queued=null;action(next);}}}
 $('test-push').onclick=async()=>{
  if(locked)return;locked=true;status('Sending a test through the push service…');
  try{
   const c=settings();if(!TERPublicConfig.valid(c))throw Error('Save your Supabase connection first.');
   const session=await auth(c);
   const response=await fetch(c.url+'/functions/v1/collect-prices/test-push',{method:'POST',headers:{apikey:c.anonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(35000)});
   if(response.status===202)status('Test submitted to the push service. Check this phone’s notifications; acceptance does not confirm display.');
   else if(response.status===404)throw Error('No saved subscription. Enable phone push first, and deploy the latest collector if this endpoint is missing.');
   else if(response.status===410)throw Error('This subscription has expired. Disable phone push, then enable it again.');
   else if(response.status===503)throw Error('Server push keys are missing. Run Deploy Supabase price collector on main.');
   else if(response.status===401)throw Error('Your push sign-in was rejected. Reopen the app and try Enable phone push.');
   else throw Error('Test push failed (HTTP '+response.status+'). Check collect-prices logs.');
  }catch(error){status(error.message);}finally{locked=false;}
 };
 $('enable-push').onclick=()=>action(true);$('disable-push').onclick=()=>action(false);
 window.addEventListener('ter-targets-changed',()=>{if(stored('ter-push-enabled:'+settings()?.url))action(true);});
 if(stored('ter-push-enabled:'+settings()?.url))status('Background push registered on this device.');
})();
