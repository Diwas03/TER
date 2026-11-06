(function(root){
 function failure(status,code){
  const suffix=' (HTTP '+status+(typeof code==='string'&&/^[a-z_]{1,60}$/.test(code)?', '+code:'')+').';
  if(code==='anonymous_provider_disabled')return Error('Anonymous Sign-Ins is disabled. In Supabase → Authentication → Sign In / Providers → Anonymous Sign-Ins, enable it and save. Then tap Enable phone push again.');
  if(code==='signup_disabled')return Error('New sign-ups are disabled in Supabase Auth. Allow new users and enable Anonymous Sign-Ins, then try again.');
  if(code==='captcha_failed'||code==='captcha_verification_failed')return Error('Supabase requires CAPTCHA for sign-in. This app needs a compatible CAPTCHA configured before push registration can work.');
  if(status===429||code==='over_request_rate_limit')return Error('Supabase sign-in rate limit reached. Wait before trying again; repeated taps will not help.');
  if(['refresh_token_not_found','refresh_token_already_used','session_not_found','user_not_found'].includes(code))return Error('This device’s push session is no longer valid. Do not clear app data yet; its existing subscription may still be active. Report this error to repair the device session'+suffix);
  if(status===401||code==='bad_jwt'||code==='invalid_api_key')return Error('Supabase rejected the public project key or session. Save the matching project URL and public key in Connection settings'+suffix);
  return Error('Supabase push sign-in failed'+suffix+' Check Authentication logs and Anonymous Sign-Ins settings.');
 }
 function usable(s,now){return !!s?.access_token&&!!s?.user?.id&&Number(s.expires_at)>now/1000+60;}
 async function authenticate(config,options={}){
  const fetcher=options.fetch||fetch,storage=options.storage||localStorage,now=options.now||Date.now;
  const run=async()=>{
   const key='ter-push-auth:'+config.url;let saved;
   try{saved=JSON.parse(storage.getItem(key));}catch{}
   if(!options.force&&usable(saved,now()))return saved;
   const refresh=!!saved?.refresh_token;
   let response;
   try{response=await fetcher(config.url+'/auth/v1/'+(refresh?'token?grant_type=refresh_token':'signup'),{
    method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},
    body:JSON.stringify(refresh?{refresh_token:saved.refresh_token}:{data:{app:'ter-price-watch'}}),signal:AbortSignal.timeout(15000)
   });}catch{throw Error('Could not reach Supabase Auth. Check your connection or private DNS/ad blocker, then try again.');}
   let payload;try{payload=await response.json();}catch{throw Error('Supabase Auth returned an unreadable response (HTTP '+response.status+').');}
   if(!response.ok)throw failure(response.status,payload?.code||payload?.error_code);
   const session={...payload,expires_at:now()/1000+Number(payload.expires_in)};
   if(!usable(session,now()))throw Error('Supabase did not return a valid push sign-in session. Check Anonymous Sign-Ins settings.');
   try{storage.setItem(key,JSON.stringify(session));}catch{throw Error('Allow site storage so this phone can keep its private push identity.');}
   return session;
  };
  // A refresh token must not be refreshed concurrently by different app tabs.
  if(!options.fetch&&root.navigator?.locks)return root.navigator.locks.request('ter-push-auth:'+config.url,run);
  return run();
 }
 root.TERPushAuth={authenticate,failure};
})(globalThis);
