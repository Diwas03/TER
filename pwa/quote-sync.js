(function(root){
 function numeric(value){return typeof value==='string'||typeof value==='number'?Number(value):NaN;}
 function canDisplay(current,quote,now=Date.now()){
  if(!quote||!Number.isFinite(numeric(quote.price))||numeric(quote.price)<=0)return false;
  const time=Date.parse(quote.observed_at);
  if(!Number.isFinite(time)||time>now+10000)return false;
  if(quote.sell_price!==null&&quote.sell_price!==undefined&&(!Number.isFinite(numeric(quote.sell_price))||numeric(quote.sell_price)<=0||numeric(quote.sell_price)>numeric(quote.price)))return false;
  // A corrupt future-dated saved row must not freeze a valid live feed indefinitely.
  const previous=Date.parse(current?.observed_at);
  return !Number.isFinite(previous)||previous>now+10000||time>=previous;
 }
 function currentQuote(payload,now=Date.now()){
  const quote=payload?.quote;
  if(!canDisplay(null,quote,now)||numeric(quote.sell_price)<=0||!Number.isFinite(numeric(quote.sell_price))||now-Date.parse(quote.observed_at)>60000)throw Error('Current TER quote unavailable or stale');
  return quote;
 }
 root.TERQuoteSync={canDisplay,currentQuote};
})(globalThis);
