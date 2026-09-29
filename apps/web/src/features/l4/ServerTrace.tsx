"use client";
import {useEffect,useState} from "react";
import * as api from "./api";

export function ServerTrace({sessionId}:{sessionId?:string}){
  const [rows,setRows]=useState<api.Receipt[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let live=true;setLoading(true);setError("");setRows([]);
    void (async()=>{try{
      const auth=api.credentials();if(auth.id!==sessionId)throw Error("旅程已切换，请重新同步。");
      const data=await api.getReceipts(auth);if(live)setRows(data);
    }catch(e){if(live)setError(e instanceof Error?e.message:"记录读取失败。");}finally{if(live)setLoading(false);}})();
    return()=>{live=false;};
  },[sessionId,attempt]);
  return <section aria-label="服务器回执列表"><h2>服务器选择记录</h2><p>唯一记录来源：服务器数据库。选门由服务器校验并保存，正式评分待配置。</p>
    <button disabled={loading} onClick={()=>setAttempt(n=>n+1)}>刷新服务器记录</button>
    {loading&&<p role="status">正在读取服务器回执…</p>}{error&&<p role="alert">{error}</p>}
    {!loading&&!error&&<>{!rows.length&&<p>尚未确认出口。</p>}<ol>{rows.map(r=><li key={r.action_id} data-action-id={r.action_id} data-source={r.authority?.record_source}>
      <strong>{r.accepted?"服务器接受":"服务器拒绝"} · {r.action.door}</strong><p>{r.code} · 版本 {r.previous_version} → {r.version}</p>
      <p>{r.received_at} · {r.action_id}</p>
      <p>前三幕完成：{r.validation.l1_complete&&r.validation.l2_complete&&r.validation.l3_complete?"通过":"未通过"}；版本校验：{r.validation.version_matches?"通过":"冲突"}；选门流程：{!r.validation.flow_evaluated?"未执行":r.validation.flow_allowed?"通过":"未通过"}。</p>
      <details><summary>查看服务器保存的校验与结果</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(r,null,2)}</pre></details>
    </li>)}</ol></>}
  </section>;
}
