const el = id => document.getElementById(id);
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
let config = read('ter-connection') || window.TER_CONFIG;
let quoteSide = 'buy', historySnapshot = null, historyLoadedAt = 0, stopRealtime = null;
let quoteSource='stored';
let days = 1, generation = 0, busy = false, pendingRefresh = false, controller, latest = null, cached = false;
const money = value => 'Nu. ' + Number(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4});
function validConfig(c) {
  if(!TERPublicConfig.valid(c))throw Error('Save your Supabase URL and public publishable or legacy anon key in Connection settings.');
}

function health() {
  if (!latest) return;
  const age = Math.max(0,Math.floor((Date.now() - Date.parse(latest.observed_at))/1000));
  const offline=cached||!navigator.onLine, stale=age>60, delayed=age>30;
  el('health').dataset.state=offline?'cached':stale||delayed?'stale':'fresh';
  el('health').textContent=offline?'Cached · not live':stale?'Stale · '+age+'s old':delayed?'Delayed · '+age+'s old':quoteSource==='direct'?'TER API · '+age+'s ago':'Saved quote · '+age+'s ago';
  el('freshness').textContent=offline?'Offline saved value. It may differ from TER.':stale?'This is an old reading. Check the collector or current price feed.':quoteSource==='direct'?'Current TER API quote · refreshed every 15 seconds.':'Saved observation · collector timing can delay this price.';
}

function renderHistory(points) {
  const usable = points.filter(p => Number.isFinite(Number(p.price)) && Number(p.price) > 0 && Number.isFinite(Date.parse(p.bucket)));
  el('rows').replaceChildren(); el('chart').replaceChildren();
  if (!usable.length) {
    el('chart').textContent = 'No history in this period. Readings appear when the collector runs.';
    ['low','high','samples'].forEach(id => el(id).textContent = '—'); return;
  }
  const low = Math.min(...usable.map(p=>Number(p.low))), high = Math.max(...usable.map(p=>Number(p.high)));
  el('low').textContent = money(low); el('high').textContent = money(high);
  el('samples').textContent = usable.reduce((n,p)=>n+Number(p.samples),0).toLocaleString();
  const ns = 'http://www.w3.org/2000/svg';
  const width=Math.max(300,Math.min(900,el('chart').clientWidth)),plotWidth=width-82;
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox',`0 0 ${width} 260`);
  const end = Date.now(), start = end - days * 86400000, span = high-low || Math.max(high*.002, .01);
  const x = p => 70 + (Date.parse(p.bucket)-start)/(end-start)*plotWidth;
  const y = p => 220 - (Number(p.price)-low+span*.15)/(span*1.3)*185;
  for(let i=0;i<4;i++) {
    const val=low+span*i/3, yy=220-(val-low+span*.15)/(span*1.3)*185;
    const grid=document.createElementNS(ns,'line');grid.setAttribute('x1','65');grid.setAttribute('x2',width-12);grid.setAttribute('y1',yy);grid.setAttribute('y2',yy);grid.setAttribute('stroke','#eef0f6');grid.setAttribute('stroke-dasharray','4 5');svg.append(grid);
    const label=document.createElementNS(ns,'text'); label.setAttribute('x','0');label.setAttribute('y',String(yy+4));label.setAttribute('fill','#8c95a6');label.setAttribute('font-size','12');label.textContent=val.toFixed(2);svg.append(label);
  }
  let path = '', previous = null;
  const gap = (days===1?5:days===7?30:120)*60000*1.5;
  for(const p of usable) {
    path += `${previous && Date.parse(p.bucket)-Date.parse(previous.bucket)<=gap?'L':'M'} ${x(p)} ${y(p)} `;
    const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x(p));dot.setAttribute('cy',y(p));dot.setAttribute('r','2');dot.setAttribute('fill',quoteSide==='buy'?'#6554d9':'#1b8d77');svg.append(dot);
    previous=p;
    const row=document.createElement('tr');
    [new Date(p.bucket).toLocaleString(),money(p.price),String(p.samples)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});el('rows').append(row);
  }
  const line=document.createElementNS(ns,'path');line.setAttribute('d',path);line.setAttribute('fill','none');line.setAttribute('stroke',quoteSide==='buy'?'#6554d9':'#1b8d77');line.setAttribute('stroke-width','2');svg.append(line);
  for(let i=0;i<4;i++){const tick=document.createElementNS(ns,'text');tick.setAttribute('x',70+i*plotWidth/3);tick.setAttribute('y','250');tick.setAttribute('fill','#8c95a6');tick.setAttribute('font-size','11');tick.setAttribute('text-anchor',i===3?'end':'start');const date=new Date(start+(end-start)*i/3);tick.textContent=days===1?date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString([],{month:'short',day:'numeric'});svg.append(tick);}
  el('chart').append(svg);
}
function renderQuote(quote,fromCache,source='stored'){
  if(!quote){if(!latest){el('price').textContent='—';el('sell-price').textContent='—';el('spread').textContent='—';el('seen').textContent='Waiting for an observation';el('health').dataset.state='waiting';el('health').textContent='Waiting for collector';el('freshness').textContent='No prices have been recorded yet.';}return;}
  if(!TERQuoteSync.canDisplay(latest,quote))return;
  const previous=latest;
  if(source==='direct'||quote.observed_at!==latest?.observed_at||quoteSource!=='direct')quoteSource=source;
  latest=quote;cached=fromCache;
  for(const [id,key,movement] of [['price','price','buy-movement'],['sell-price','sell_price','sell-movement']]){
    const amount=Number(quote[key]),old=Number(previous?.[key]);
    el(id).textContent=amount>0?money(amount):'—';
    if(!fromCache&&old>0&&amount>0&&amount!==old){
      const change=amount-old;el(movement).textContent=(change>0?'+':'-')+Math.abs(change).toFixed(4)+' since last quote';
      el(id).closest('.price-card').classList.add('changed');setTimeout(()=>el(id).closest('.price-card').classList.remove('changed'),1100);
    }else if(!previous)el(movement).textContent='Waiting for next change';
  }
  const spread=Number(quote.price)-Number(quote.sell_price);
  el('spread').textContent=Number(quote.sell_price)>0&&spread>=0?money(spread):'—';
  el('seen').textContent='As of '+new Date(quote.observed_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  health();
}
function render(data, fromCache) {renderQuote(data.latest,fromCache);renderHistory(data.history);}
function connectRealtime(){
  stopRealtime?.();stopRealtime=null;
  try{validConfig(config);}catch{return;}
  const project=config.url;
  stopRealtime=TERRealtime.connect(config,quote=>{
    if(config.url!==project)return;
    renderQuote(quote,false);checkAlerts(latest);
    if(historySnapshot){write('ter-prices:'+project+':'+quoteSide+':'+days,{latest,history:historySnapshot});}
  },()=>{});
}

async function refresh() {
  if(busy){pendingRefresh=true;return;}
  pendingRefresh=false;
  const c={...config},version=generation,range=days,side=quoteSide;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url||'')){el('health').textContent='Setup needed';el('message').textContent='Save your Supabase project URL in Connection settings.';return;}
  busy=true;controller=new AbortController();const signal=controller.signal,timeout=setTimeout(()=>controller.abort(),15000);
  const cacheKey='ter-prices:'+c.url+':'+side+':'+range;
  const old=read(cacheKey);if(old&&!latest)render(old,true);
  let liveOK=false,storedOK=false,storageError=false;
  const isCurrent=()=>version===generation;
  async function api(path,options={}){
    const response=await fetch(c.url+'/rest/v1/'+path,{...options,headers:TERPublicConfig.headers(c),signal,cache:'no-store'});
    if(!response.ok)throw Error('Stored prices unavailable');return response.json();
  }
  const direct=(async()=>{
    try{
      const response=await fetch(c.url+'/functions/v1/collect-prices/quote',{signal,cache:'no-store'});
      if(!response.ok)throw Error('Current feed unavailable');
      const quote=TERQuoteSync.currentQuote(await response.json());
      if(!isCurrent())return;
      liveOK=true;renderQuote(quote,false,'direct');checkAlerts(latest);
      write(cacheKey,{latest,history:historySnapshot||[]});el('message').textContent='';
    }catch{/* Saved values remain available and explicitly labeled if live access fails. */}
  })();
  const quotes=(async()=>{
    if(!TERPublicConfig.valid(c))return;
    try{
      const rows=await api('price_observations?select=*&order=observed_at.desc&limit=1');
      if(!isCurrent())return;
      storedOK=true;renderQuote(rows[0]||null,false);checkAlerts(latest);
    }catch{storageError=true;}
  })();
  const history=(async()=>{
    if(!TERPublicConfig.valid(c)){if(isCurrent()){renderHistory([]);el('chart-note').textContent='Add your public Supabase key in Connection settings to load stored history.';}return;}
    if(historySnapshot&&Date.now()-historyLoadedAt<60000){renderHistory(historySnapshot);return;}
    try{
      let points;
      try{points=await api('rpc/price_history_side',{method:'POST',body:JSON.stringify({range_days:range,quote_side:side})});}
      catch(error){if(side!=='buy')throw error;points=await api('rpc/price_history',{method:'POST',body:JSON.stringify({range_days:range})});}
      if(!isCurrent())return;
      historySnapshot=points;historyLoadedAt=Date.now();renderHistory(points);
      el('chart-note').textContent='Bucket averages · gaps indicate missing observations';
    }catch{if(isCurrent())el('chart-note').textContent='History unavailable. Live price cards update independently.';}
  })();
  try{
    await Promise.allSettled([direct,quotes,history]);
    if(!isCurrent())return;
    if(!liveOK&&!storedOK){cached=true;health();el('message').textContent=navigator.onLine?'Current and stored feeds unavailable. Showing the last saved reading, if any.':'Offline. Showing saved observations when available.';}
    else if(!liveOK)el('message').textContent='Showing saved prices. Deploy the latest Supabase collector to enable the direct current-price feed.';
    else if(storageError)el('message').textContent='Current TER prices available; stored history connection needs attention.';
    else el('message').textContent='';
    if(latest)write(cacheKey,{latest,history:historySnapshot||[]});
  }finally{clearTimeout(timeout);busy=false;if(!isCurrent()||pendingRefresh)refresh();}
}

el('settings').onsubmit=e=>{e.preventDefault();const next={url:el('url').value.trim().replace(/\/$/,''),anonKey:el('key').value.trim()};try{validConfig(next);}catch(error){el('message').textContent=error.message;return;}config=next;write('ter-connection',next);generation++;controller?.abort();latest=null;historySnapshot=null;historyLoadedAt=0;render({latest:null,history:[]},false);connectRealtime();refresh();};
document.querySelectorAll('[data-days]').forEach(button=>button.onclick=()=>{days=Number(button.dataset.days);historySnapshot=null;historyLoadedAt=0;el('chart-period').textContent=days===1?'Last 24 hours':'Last '+days+' days';generation++;controller?.abort();document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderHistory([]);refresh();});
document.querySelectorAll('[data-side]').forEach(button=>button.onclick=()=>{quoteSide=button.dataset.side;historySnapshot=null;historyLoadedAt=0;generation++;controller?.abort();document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));el('table-price-label').textContent='Average '+quoteSide+' BTN';el('chart').setAttribute('aria-label',quoteSide+' price history chart');renderHistory([]);refresh();});
el('url').value=config?.url||'';el('key').value=config?.anonKey||'';el('refresh').onclick=refresh;
let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;el('install').hidden=false;});el('install').onclick=async()=>{await installPrompt?.prompt();installPrompt=null;el('install').hidden=true;};
window.addEventListener('online',()=>{connectRealtime();refresh();});window.addEventListener('offline',health);document.addEventListener('visibilitychange',()=>{if(!document.hidden){connectRealtime();refresh();}else{stopRealtime?.();stopRealtime=null;}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{el('message').textContent='Offline installation unavailable in this browser.';});
setInterval(()=>{if(!document.hidden)health();},1000);
setInterval(()=>{if(!document.hidden)refresh();},15000);connectRealtime();refresh();

let targets = read('ter-targets:'+config?.url) || {};
function saveTargets(){write('ter-targets:'+config?.url,targets);}
function showTargets(){
  el('buy-target').value=targets.buy ?? '';el('sell-target').value=targets.sell ?? '';
  el('alert-status').textContent=[targets.buy?'Buy ≤ '+money(targets.buy):'',targets.sell?'Sell ≥ '+money(targets.sell):''].filter(Boolean).join(' · ') || 'No targets set.';
}
function checkAlerts(quote){
  if(read('ter-push-enabled:'+config?.url))return;
  const result=TERAlerts.evaluate(targets,quote,Date.now());
  targets=result.state;saveTargets();
  if(!result.hits.length)return;
  const text=result.hits.map(hit=>`${hit.side==='buy'?'Buy':'Sell'} target reached: ${money(hit.price)} (${hit.side==='buy'?'at or below':'at or above'} ${money(hit.target)}).`).join(' ');
  el('alert-banner').textContent=text;el('alert-banner').hidden=false;
  if('Notification' in window && Notification.permission==='granted' && 'serviceWorker' in navigator){
    navigator.serviceWorker.ready.then(reg=>reg.showNotification('TER target reached',{body:text,icon:'./icon.svg',tag:'ter-target-'+result.hits.map(h=>h.side).join('-')})).catch(()=>{el('notification-status').textContent='Phone notification failed. Your alert is shown above.';});
  }
}
el('alert-settings').onsubmit=e=>{
  e.preventDefault();const buy=el('buy-target').value,sell=el('sell-target').value;
  targets={buy:buy?Number(buy):null,sell:sell?Number(sell):null};
  saveTargets();showTargets();el('alert-banner').hidden=true;refresh();window.dispatchEvent(new Event('ter-targets-changed'));
};
el('clear-alerts').onclick=()=>{targets={};saveTargets();showTargets();el('alert-banner').hidden=true;window.dispatchEvent(new Event('ter-targets-changed'));};
el('enable-notifications').onclick=async()=>{
  if(!('Notification' in window)){el('notification-status').textContent='Notifications unavailable. On iPhone, install this app on your Home Screen and open it there. In-app alerts still work.';return;}
  try{const permission=await Notification.requestPermission();el('notification-status').textContent=permission==='granted'?'Notifications enabled while this app is running. Closed-app push delivery is not configured.':'Notifications not enabled. In-app alerts still work.';}catch{el('notification-status').textContent='Could not enable notifications. In-app alerts still work.';}
};
el('settings').addEventListener('submit',()=>{targets=read('ter-targets:'+config?.url)||{};showTargets();el('alert-banner').hidden=true;});
showTargets();

let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(historySnapshot)renderHistory(historySnapshot);},100);});
document.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(item=>item.classList.toggle('nav-active',item===link));}));
