/* Pure alert rules, also exercised by Node tests. Prices are compared in 1/10,000 BTN. */
(function(root){
  function units(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n*10000):null;
  }
  function evaluate(previous, quote, now){
    const state={...previous},hits=[];
    const age=now-Date.parse(quote?.observed_at);
    if(!quote||!Number.isFinite(age)||age< -10000||age>120000)return {state,hits};
    for(const side of ['buy','sell']){
      const price=side==='buy'?quote.price:quote.sell_price;
      const current=units(price),target=units(state[side]);
      if(current===null||target===null)continue;
      // Never rearm from an older quote. Retries of the same quote are harmless.
      if(state[side+'Seen']&&Date.parse(quote.observed_at)<Date.parse(state[side+'Seen']))continue;
      state[side+'Seen']=quote.observed_at;
      const matched=side==='buy'?current<=target:current>=target;
      if(matched&&!state[side+'Triggered'])hits.push({side,price,target:state[side]});
      state[side+'Triggered']=matched;
    }
    return {state,hits};
  }
  root.TERAlerts={evaluate};
})(globalThis);
