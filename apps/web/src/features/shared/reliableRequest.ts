type Options = {retryDelays?:number[];beforeAttempt?:()=>void};
const transientStatuses=new Set([408,502,503,504]);
export class SyncUnavailable extends Error {
  constructor(public status?:number) {
    super(status
      ? `服务器暂时无法确认操作（HTTP ${status}）。待同步操作已保留，请重试同步。`
      : "网络连接中断或响应超时。待同步操作已保留，请检查网络后重试同步。");
  }
}

// Only use for reads or server-idempotent requests. The serialized body is reused.
export async function reliableJson(url:string, init:RequestInit, options:Options={}) {
  const delays=options.retryDelays??[400];
  for(let attempt=0;;attempt++) {
    options.beforeAttempt?.();
    let response:Response;
    try {
      response=await fetch(url,{...init,signal:AbortSignal.timeout(12000)});
    } catch(error) {
      const transient=error instanceof TypeError || (error instanceof Error&&["TimeoutError","AbortError"].includes(error.name));
      if(!transient)throw error;
      if(attempt>=delays.length)throw new SyncUnavailable();
      await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
      continue;
    }
    if(transientStatuses.has(response.status)) {
      void response.body?.cancel();
      if(attempt>=delays.length)throw new SyncUnavailable(response.status);
      await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
      continue;
    }
    // Authentication, conflicts and domain rejections must not be retried blindly.
    let data;
    try {data=await response.json();}
    catch {throw new Error(`服务器返回了无法读取的响应（HTTP ${response.status}）。待同步操作已保留，请重试同步。`);}
    return {response,data};
  }
}
