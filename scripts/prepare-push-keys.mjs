import {readFileSync,writeFileSync} from 'node:fs';
import {createECDH} from 'node:crypto';
const records=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(!Array.isArray(records)||records.some(r=>typeof r.name!=='string'))throw Error('Unexpected Supabase secrets listing; no keys changed');
const names=new Set(records.map(r=>r.name));
const pub=names.has('VAPID_PUBLIC_KEY'),priv=names.has('VAPID_PRIVATE_KEY');
if(pub&&priv){console.log('Existing push keys retained');process.exit(0);}
if(pub!==priv)throw Error('Incomplete VAPID key pair. Restore the matching key before deployment.');
const key=createECDH('prime256v1');key.generateKeys();
const scalar=key.getPrivateKey(),privateKey=Buffer.alloc(32);scalar.copy(privateKey,32-scalar.length);
writeFileSync(process.argv[3],`VAPID_PUBLIC_KEY=${key.getPublicKey().toString('base64url')}\nVAPID_PRIVATE_KEY=${privateKey.toString('base64url')}\n`,{mode:0o600});
console.log('New push key pair prepared without printing key material');
