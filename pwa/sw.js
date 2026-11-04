const CACHE = 'ter-watch-v7';
const FILES = ['./','./index.html','./style.css','./app.js','./alerts.js','./realtime.js','./push.js','./config.js','./public-config.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ter-watch-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(self.registration.scope.replace(url.origin,'')))return;
  if(!FILES.some(file=>new URL(file,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request)));
});

self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{for(const client of windows){if(client.url.startsWith(self.registration.scope))return client.focus();}return clients.openWindow(self.registration.scope);}));});

self.addEventListener('push',event=>{event.waitUntil((async()=>{let data;try{data=event.data.json();}catch{return;}const age=Date.now()-Date.parse(data.observed_at);if(!Number.isFinite(age)||age>180000||age< -10000)return;await self.registration.showNotification(data.title||'TER price alert',{body:data.body||'',icon:'./icon.svg',tag:data.tag||'ter-price'});})());});
