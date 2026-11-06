import {makePushRequest} from './web-push-request.mjs';
import {supportedEndpoint} from './push-rules.mjs';
export async function deliverPush(subscription,payload,options){
 if(!supportedEndpoint(subscription?.endpoint))throw Object.assign(Error('Unsupported push endpoint'),{code:'push_endpoint_invalid'});
 let details;
 try{
  // Native Web Crypto avoids unsupported Node crypto/HTTPS paths in Edge runtimes.
  details=await (options.generateRequestDetails||makePushRequest)(subscription,payload,options);
 }catch(error){
  const known=['push_subscription_key_invalid','push_vapid_public_invalid','push_vapid_private_invalid','push_vapid_pair_mismatch','push_runtime_crypto_error'];
  if(known.includes(error?.code))throw error;
  throw Object.assign(Error('Push encryption failed in runtime'),{code:'push_runtime_crypto_error'});
 }
 if(!supportedEndpoint(details.endpoint))throw Object.assign(Error('Unsupported push endpoint'),{code:'push_endpoint_invalid'});
 let response;
 try{response=await (options.fetch||fetch)(details.endpoint,{method:details.method||'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});}
 catch{throw Object.assign(Error('Push provider connection failed'),{code:'push_network_error'});}
 if(!response.ok){
  const statusCode=response.status;
  const code=[404,410].includes(statusCode)?'push_subscription_expired':[401,403].includes(statusCode)?'push_provider_auth_rejected':statusCode===429?'push_rate_limited':'push_provider_unavailable';
  // Never return the provider's response body, endpoint or authorization headers.
  throw Object.assign(Error(code),{code,statusCode});
 }
}
