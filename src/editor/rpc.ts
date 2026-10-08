import {ADVICE_TIMEOUT,RPC_LIMITS} from '../core/limits.ts';
import {RPC,resultSchema,SketchError,type Owner} from '../core/contracts.ts';
export async function rpc(method:string,owner:Owner|null,payload:unknown,signal?:AbortSignal):Promise<unknown> {
 const requestId=crypto.randomUUID();
 const combined=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(method==='advice/generate'?ADVICE_TIMEOUT.maxMs+ADVICE_TIMEOUT.responseGraceMs:RPC_LIMITS.ordinaryTimeoutMs)]);
 const response=await fetch(`${RPC}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,requestId,owner,payload}),signal:combined});
 if(response.status===401 || response.status===403)throw new SketchError('AUTH_REQUIRED','Harness 登录连接已失效，请重新打开宿主页面',response.status);
 const decoded=resultSchema.parse(await response.json());
 if(decoded.requestId!==requestId && decoded.requestId!=='invalid-request')throw new Error('请求标识不一致');
 if(!decoded.ok)throw new SketchError(decoded.error.code,decoded.error.message,response.status);
 return decoded.value;
}
