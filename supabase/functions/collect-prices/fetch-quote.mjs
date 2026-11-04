import {parseQuote} from './quote.mjs';
export async function fetchQuote(fetcher=fetch){
 const response=await fetcher('https://api.ter.bt/prices',{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('TER quote unavailable');
 return parseQuote(await response.json());
}
