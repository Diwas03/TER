const el = id => document.getElementById(id);
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
let config = read('ter-connection') || window.TER_CONFIG;
let days = 1, generation = 0, busy = false, controller, latest = null, cached = false;
const money = value => 'Nu. ' + Number(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4});
function validConfig(c) {
  if (!c || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url)) throw Error('Add your Supabase project in Connection settings.');
  try { const claims = JSON.parse(atob(c.anonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (claims.role !== 'anon') throw Error(); }
  catch { throw Error('Use only the public legacy anon key from Supabase API settings.'); }
}
function health() {
  if (!latest) return;
  const age = (Date.now() - Date.parse(latest.observed_at)) / 1000;
  const stale = !Number.isFinite(age) || age > 60 || age < -10;
  el('health').textContent = cached || !navigator.onLine ? 'Cached · not live' : stale ? 'Stale reading' : 'Recent observation';
  el('freshness').textContent = stale ? 'Collector may be stopped or TER may need a new login.' : 'Observed recently; quote freshness is not independently verified.';
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
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox','0 0 900 260');
  const start = Date.now() - days * 86400000, end = Date.now(), span = high-low || Math.max(high*.002, .01);
  const x = p => 70 + (Date.parse(p.bucket)-start)/(end-start)*810;
  const y = p => 220 - (Number(p.price)-low+span*.15)/(span*1.3)*185;
  for(let i=0;i<4;i++) {
    const val=low+span*i/3, yy=220-(val-low+span*.15)/(span*1.3)*185;
    const label=document.createElementNS(ns,'text'); label.setAttribute('x','0');label.setAttribute('y',String(yy+4));label.setAttribute('fill','#65766b');label.setAttribute('font-size','12');label.textContent=val.toFixed(2);svg.append(label);
  }
  let path = '', previous = null;
  const gap = (days===1?5:days===7?30:120)*60000*1.5;
  for(const p of usable) {
    path += `${previous && Date.parse(p.bucket)-Date.parse(previous.bucket)<=gap?'L':'M'} ${x(p)} ${y(p)} `;
    const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x(p));dot.setAttribute('cy',y(p));dot.setAttribute('r','2');dot.setAttribute('fill','#a87924');svg.append(dot);
    previous=p;
    const row=document.createElement('tr');
    [new Date(p.bucket).toLocaleString(),money(p.price),String(p.samples)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});el('rows').append(row);
  }
  const line=document.createElementNS(ns,'path');line.setAttribute('d',path);line.setAttribute('fill','none');line.setAttribute('stroke','#184e43');line.setAttribute('stroke-width','2');svg.append(line);el('chart').append(svg);
}
function render(data, fromCache) {
  latest = data.latest; cached = fromCache;
  el('price').textContent = latest ? money(latest.price) : '—';
  el('seen').textContent = latest ? 'Observed: '+new Date(latest.observed_at).toLocaleString() : 'No observation available';
  if (!latest) { el('health').textContent='Waiting for collector';el('freshness').textContent='No prices have been recorded yet.'; }
  renderHistory(data.history);health();
}
async function refresh() {
  if (busy) return;
  let c = {...config}; const version=generation, range=days;
  try { validConfig(c); } catch(e) {el('health').textContent='Setup needed';el('message').textContent=e.message;return;}
  busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  const cacheKey='ter-prices:'+c.url+':'+range;
  const old=read(cacheKey);if(old)render(old,true);
  async function api(path, options={}) {
    const r=await fetch(c.url+'/rest/v1/'+path,{...options,headers:{apikey:c.anonKey,Authorization:'Bearer '+c.anonKey,'Content-Type':'application/json'},signal:controller.signal,cache:'no-store'});
    if(!r.ok)throw Error('Price service unavailable ('+r.status+'). Check project settings and SQL setup.');return r.json();
  }
  try {
    const [quotes,history]=await Promise.all([api('price_observations?select=price,observed_at&order=observed_at.desc&limit=1'),api('rpc/price_history',{method:'POST',body:JSON.stringify({range_days:range})})]);
    if(version!==generation)return;
    const data={latest:quotes[0]||null,history};render(data,false);write(cacheKey,data);el('message').textContent='';
  } catch(e) {if(version!==generation)return;cached=true;health();el('health').textContent=latest?'Cached · not live':'Unavailable';el('message').textContent=navigator.onLine?(e.name==='AbortError'?'Price request timed out.':e.message):'Offline. Showing saved observations when available.';}
  finally {clearTimeout(timeout);busy=false;if(version!==generation)refresh();}
}
el('settings').onsubmit=e=>{e.preventDefault();const next={url:el('url').value.trim().replace(/\/$/,''),anonKey:el('key').value.trim()};try{validConfig(next);}catch(error){el('message').textContent=error.message;return;}config=next;write('ter-connection',next);generation++;controller?.abort();latest=null;render({latest:null,history:[]},false);refresh();};
document.querySelectorAll('[data-days]').forEach(button=>button.onclick=()=>{days=Number(button.dataset.days);generation++;controller?.abort();document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderHistory([]);refresh();});
el('url').value=config?.url||'';el('key').value=config?.anonKey||'';el('refresh').onclick=refresh;
let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;el('install').hidden=false;});el('install').onclick=async()=>{await installPrompt?.prompt();installPrompt=null;el('install').hidden=true;};
window.addEventListener('online',refresh);window.addEventListener('offline',health);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{el('message').textContent='Offline installation unavailable in this browser.';});
setInterval(()=>{health();if(!document.hidden)refresh();},15000);refresh();
