const el = id => document.getElementById(id);
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
let config = read('ter-connection') || window.TER_CONFIG;
let historySnapshot = null, historyLoadedAt = 0, stopRealtime = null;
let quoteSource='stored';
let hours = 1, generation = 0, busy = false, pendingRefresh = false, controller, latest = null, cached = false;
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
  const model=TERChart.prepare(points,hours);
  el('rows').replaceChildren();el('chart').replaceChildren();
  el('samples').textContent=model.samples?model.samples.toLocaleString():'—';
  for(const series of model.series)el(series.side+'-range').textContent=series.low===null?'—':money(series.low)+' / '+money(series.high);
  if(!model.rows.length){el('chart').textContent='No stored readings in this period yet.';return;}
  const ns='http://www.w3.org/2000/svg',width=Math.max(300,Math.min(900,el('chart').clientWidth)),plotWidth=width-82;
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} 260`);
  const span=model.high-model.low||Math.max(model.high*.002,.01);
  const x=p=>70+(Date.parse(p.bucket)-model.start)/(model.end-model.start)*plotWidth;
  const y=value=>220-(Number(value)-model.low+span*.15)/(span*1.3)*185;
  function shape(name,attrs){const item=document.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))item.setAttribute(key,String(value));return item;}
  for(let i=0;i<4;i++){
    const value=model.low+span*i/3,yy=y(value);
    svg.append(shape('line',{x1:65,x2:width-12,y1:yy,y2:yy,stroke:'#eef0f6','stroke-dasharray':'4 5'}));
    const label=shape('text',{x:0,y:yy+4,fill:'#8c95a6','font-size':11});label.textContent=value.toFixed(2);svg.append(label);
  }
  for(const series of model.series){
    const color=series.side==='buy'?'#6554d9':'#1b8d77';
    for(const segment of TERChart.segments(model.rows,series.side,model.step)){
      const d=segment.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(p[series.side+'_price'])}`).join(' ');
      const path=shape('path',{d,fill:'none',stroke:color,'stroke-width':2,'data-series':series.side,'stroke-linejoin':'round','stroke-linecap':'round'});
      if(series.side==='sell')path.setAttribute('stroke-dasharray','6 4');svg.append(path);
      for(const p of segment){
        const dot=shape('circle',{cx:x(p),cy:y(p[series.side+'_price']),r:2,fill:color});
        const title=shape('title',{});title.textContent=series.side+' '+money(p[series.side+'_price'])+' · '+new Date(p.bucket).toLocaleString();dot.append(title);svg.append(dot);
      }
    }
  }
  for(const p of model.rows){
    const row=document.createElement('tr');
    [new Date(p.bucket).toLocaleString(),p.buy_price===null?'—':money(p.buy_price),p.sell_price===null?'—':money(p.sell_price),String(p.samples||0)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});el('rows').append(row);
  }
  for(let i=0;i<4;i++){
    const tick=shape('text',{x:70+i*plotWidth/3,y:250,fill:'#8c95a6','font-size':11,'text-anchor':i===3?'end':'start'});
    tick.textContent=new Date(model.start+(model.end-model.start)*i/3).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});svg.append(tick);
  }
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
    if(historySnapshot){write('ter-prices:'+project+':window:'+hours,{latest,history:historySnapshot});}
  },()=>{});
}

async function refresh() {
  if(busy){pendingRefresh=true;return;}
  pendingRefresh=false;
  const c={...config},version=generation,range=hours;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url||'')){el('health').textContent='Setup needed';el('message').textContent='Save your Supabase project URL in Connection settings.';return;}
  busy=true;controller=new AbortController();const signal=controller.signal,timeout=setTimeout(()=>controller.abort(),15000);
  const cacheKey='ter-prices:'+c.url+':window:'+range;
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
      let points,legacy=false;
      try{points=await api('rpc/price_history_window',{method:'POST',body:JSON.stringify({window_hours:range})});}
      catch{
        const results=await Promise.allSettled(['buy','sell'].map(quote_side=>api('rpc/price_history_side',{method:'POST',body:JSON.stringify({range_days:1,quote_side})})));
        if(results.every(r=>r.status==='rejected'))throw Error('History not configured');
        points=TERChart.mergeLegacy(...results.map(r=>r.status==='fulfilled'?r.value:[]));legacy=true;
      }
      if(!isCurrent())return;
      historySnapshot=points;historyLoadedAt=Date.now();renderHistory(points);
      el('chart-note').textContent=legacy?'5-minute averages · run chart-windows.sql for finer 1h / 2h history.':'Buy and sell bucket averages · gaps indicate missing observations';
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
document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{hours=Number(button.dataset.hours);historySnapshot=null;historyLoadedAt=0;el('chart-period').textContent='Last '+hours+(hours===1?' hour':' hours');generation++;controller?.abort();document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderHistory([]);refresh();});
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
