import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../pwa/public-config.js';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {valid,headers}=globalThis.TERPublicConfig;
const url='https://project.supabase.co';
const jwt=role=>'e30.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.test';
test('accepts only public publishable and legacy anon keys',()=>{
 for(const anonKey of ['sb_publishable_test',jwt('anon')])assert.equal(valid({url,anonKey}),true);
 for(const anonKey of ['', 'sb_secret_test',jwt('service_role'),'invalid'])assert.equal(valid({url,anonKey}),false);
 assert.equal(valid({url:'http://project.supabase.co',anonKey:'sb_publishable_test'}),false);
});
test('publishable key is sent as apikey, never as a bearer JWT',()=>{
 assert.equal(headers({anonKey:'sb_publishable_test'}).Authorization,undefined);
 assert.equal(headers({anonKey:jwt('anon')}).Authorization,'Bearer '+jwt('anon'));
});
test('Pages build needs no variables, accepts both key types, rejects privileged keys',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ter-pages-test-'));
 try{
  let i=0;
  for(const env of [{},{VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},{VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:jwt('anon')}]){
   const output=join(dir,String(i++));
   execFileSync(process.execPath,['scripts/build-pages.mjs',output],{env,stdio:'pipe'});
   const text=readFileSync(join(output,'config.js'),'utf8');assert.ok(text.includes('window.TER_CONFIG'));
   if(env.VITE_SUPABASE_PUBLISHABLE_KEY)assert.ok(text.includes('sb_publishable_test'));
   assert.ok(readFileSync(join(output,'index.html'),'utf8').includes('public-config.js'));
  }
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-pages.mjs',join(dir,'rejected')],{env:{VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'},stdio:'pipe'}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
