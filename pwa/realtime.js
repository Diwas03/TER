/* Small Phoenix-protocol client for Supabase's public Postgres insert stream. */
(function(root){
 root.TERRealtime={connect(config,onQuote,onStatus){
   let socket,heartbeat,retry,stopped=false,attempt=0,ref=0;
   const topic='realtime:ter-price-watch';
   const send=(event,payload={},target=topic)=>{if(socket?.readyState===1)socket.send(JSON.stringify({topic:target,event,payload,ref:String(++ref)}));};
   function start(){
     if(stopped)return;
     onStatus('connecting');
     try{socket=new WebSocket(config.url.replace(/^https:/,'wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(config.anonKey)+'&vsn=1.0.0');}
     catch{reconnect();return;}
     socket.onopen=()=>{
       send('phx_join',{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'INSERT',schema:'public',table:'price_observations'}],private:false},...(config.anonKey.startsWith('sb_publishable_')?{}:{access_token:config.anonKey})});
       heartbeat=setInterval(()=>send('heartbeat',{},'phoenix'),25000);
     };
     socket.onmessage=event=>{
       let message;try{message=JSON.parse(event.data);}catch{return;}
       if(message.topic===topic && message.event==='phx_reply'){
         if(message.payload?.status==='ok'){attempt=0;onStatus('connected');}else onStatus('polling');
       }
       if(message.event==='postgres_changes' && message.payload?.data?.type==='INSERT')onQuote(message.payload.data.record);
       if(message.event==='system' && message.payload?.status==='error')onStatus('polling');
       if(message.event==='phx_error')socket.close();
     };
     socket.onerror=()=>onStatus('polling');socket.onclose=reconnect;
   }
   function reconnect(){clearInterval(heartbeat);onStatus('polling');if(!stopped)retry=setTimeout(start,Math.min(30000,1000*2**Math.min(attempt++,5)));}
   start();
   return ()=>{stopped=true;clearInterval(heartbeat);clearTimeout(retry);if(socket){socket.onclose=null;socket.close();}};
 }};
})(globalThis);
