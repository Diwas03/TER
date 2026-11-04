/* Public project keys only. Privileged keys must never enter frontend settings. */
(function(root){
 function isPublicKey(key){
  if(typeof key!=='string')return false;
  if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
  try{const part=key.split('.')[1];return JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}
 }
 function valid(config){return !!config&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)&&isPublicKey(config.anonKey);}
 function headers(config){const result={apikey:config.anonKey,'Content-Type':'application/json'};if(!config.anonKey.startsWith('sb_publishable_'))result.Authorization='Bearer '+config.anonKey;return result;}
 root.TERPublicConfig={isPublicKey,valid,headers};
})(globalThis);
