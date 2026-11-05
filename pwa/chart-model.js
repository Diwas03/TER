(function(root){
 const valid=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>0;
 function prepare(points,hours,now=Date.now()){
  if(![1,2,24].includes(hours))throw Error('Unsupported chart range');
  const start=now-hours*3600000,step=Math.max(hours===1?30000:hours===2?60000:300000,...(Array.isArray(points)?points:[]).map(p=>p.legacy_bucket_ms===300000?300000:0));
  const rows=(Array.isArray(points)?points:[]).filter(p=>Number.isFinite(Date.parse(p.bucket))&&Date.parse(p.bucket)>=start&&Date.parse(p.bucket)<=now)
   .map(p=>({...p,buy_price:valid(p.buy_price)?Number(p.buy_price):null,sell_price:valid(p.sell_price)?Number(p.sell_price):null}))
   .filter(p=>p.buy_price!==null||p.sell_price!==null).sort((a,b)=>Date.parse(a.bucket)-Date.parse(b.bucket));
  const series=['buy','sell'].map(side=>{
   const list=rows.filter(p=>valid(p[side+'_price']));
   return {side,points:list,low:list.length?Math.min(...list.map(p=>valid(p[side+'_low'])?Number(p[side+'_low']):p[side+'_price'])):null,
    high:list.length?Math.max(...list.map(p=>valid(p[side+'_high'])?Number(p[side+'_high']):p[side+'_price'])):null};
  });
  const values=series.flatMap(s=>s.low===null?[]:[s.low,s.high]);
  return {rows,series,start,end:now,step,low:values.length?Math.min(...values):null,high:values.length?Math.max(...values):null,samples:rows.reduce((sum,p)=>sum+(Number(p.samples)||0),0)};
 }
 function segments(rows,side,step){
  const result=[];let segment=[];let previous=null;
  for(const p of rows){
   if(!valid(p[side+'_price'])){if(segment.length)result.push(segment);segment=[];previous=null;continue;}
   if(previous&&Date.parse(p.bucket)-Date.parse(previous.bucket)>step*1.5){if(segment.length)result.push(segment);segment=[];}
   segment.push(p);previous=p;
  }
  if(segment.length)result.push(segment);return result;
 }
 function mergeLegacy(buy,sell){
  const map=new Map();
  for(const [side,rows]of [['buy',buy],['sell',sell]])for(const p of rows){
   const row=map.get(p.bucket)||{bucket:p.bucket,samples:0,legacy_bucket_ms:300000};
   row[side+'_price']=p.price;row[side+'_low']=p.low;row[side+'_high']=p.high;row.samples=Math.max(row.samples,Number(p.samples)||0);map.set(p.bucket,row);
  }
  return [...map.values()];
 }
 root.TERChart={prepare,segments,mergeLegacy};
})(globalThis);
