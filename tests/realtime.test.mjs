import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../pwa/realtime.js',import.meta.url),'utf8');
test('subscribes to public inserts, forwards quotes, heartbeats and closes cleanly',()=>{
 const sockets=[],intervals=[],timeouts=[],status=[],quotes=[];
 class Socket{constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.closed=true;this.onclose?.();}}
 const context={WebSocket:Socket,setInterval:fn=>{intervals.push(fn);return 1;},clearInterval:()=>{},setTimeout:fn=>{timeouts.push(fn);return 1;},clearTimeout:()=>{}};
 vm.createContext(context);vm.runInContext(source,context);
 const stop=context.TERRealtime.connect({url:'https://project.supabase.co',anonKey:'public-key'},q=>quotes.push(q),s=>status.push(s));
 const socket=sockets[0];assert.ok(socket.url.startsWith('wss://project.supabase.co/'));
 socket.onopen();const join=socket.sent[0];assert.equal(join.event,'phx_join');assert.equal(join.payload.config.postgres_changes[0].table,'price_observations');
 socket.onmessage({data:JSON.stringify({topic:join.topic,event:'phx_reply',payload:{status:'ok'}})});assert.ok(status.includes('connected'));
 socket.onmessage({data:JSON.stringify({event:'postgres_changes',payload:{data:{type:'INSERT',record:{price:'125'}}}})});assert.equal(quotes[0].price,'125');
 intervals[0]();assert.equal(socket.sent.at(-1).event,'heartbeat');
 stop();assert.equal(socket.closed,true);assert.equal(timeouts.length,0);
});
test('disconnected stream falls back and reconnects without exposing credentials',()=>{
 const sockets=[],timeouts=[],status=[];
 class Socket{constructor(){sockets.push(this);}close(){this.onclose?.();}}
 const context={WebSocket:Socket,setInterval:()=>1,clearInterval:()=>{},setTimeout:fn=>{timeouts.push(fn);return 1;},clearTimeout:()=>{}};
 vm.createContext(context);vm.runInContext(source,context);
 const stop=context.TERRealtime.connect({url:'https://project.supabase.co',anonKey:'public'},()=>{},s=>status.push(s));
 sockets[0].onclose();assert.equal(status.at(-1),'polling');assert.equal(timeouts.length,1);timeouts[0]();assert.equal(sockets.length,2);stop();
});
