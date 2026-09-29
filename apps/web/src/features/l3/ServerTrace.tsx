"use client";
import {useEffect,useState} from "react";
import * as api from "./api";
import {describe} from "./model";

export function ServerTrace({sessionId}:{sessionId?:string}){
 const [rows,setRows]=useState<api.Receipt[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError("");setRows([]);
  void (async()=>{try{const auth=api.credentials();if(auth.id!==sessionId)throw Error("旅程已切换，请重新同步。");
   const data=await api.getReceipts(auth);if(!Array.isArray(data))throw Error("回执格式无效。");if(live)setRows(data);
  }catch(e){if(live)setError(e instanceof Error?e.message:"记录读取失败。");}finally{if(live)setLoading(false);}})();
  return()=>{live=false;};
 },[sessionId,attempt]);
 return <section aria-label="服务器回执列表"><h2>服务器选择记录</h2><p>唯一数据源：服务器数据库回执。输入来自客户端，接受/拒绝及结果由服务器判定。正式评分待配置。</p><p>会话：{sessionId||"尚未连接"}</p>
  <button disabled={loading} onClick={()=>setAttempt(n=>n+1)}>刷新服务器记录</button>
  {loading&&<p role="status">正在读取服务器回执…</p>}{error&&<p role="alert">{error}</p>}
  {!loading&&!error&&<><p>服务器返回 {rows.length} 条回执。重复否可有确认回执，但不增加流程事件或分值。</p>{!rows.length&&<p>尚无服务器动作记录。</p>}
  <ol>{rows.map(r=>{return <li key={r.action_id} data-action-id={r.action_id} data-source={r.authority.record_source} data-accepted={String(r.accepted)}>
   <strong>{r.accepted?"服务器接受":"服务器拒绝"} · {describe(r.action)}</strong><p>{r.code} · 版本 {r.previous_version} → {r.version}</p><small>{r.received_at} · {r.action_id}</small><p>{r.rules_version} / {r.validation_version}</p>
   <details><summary>服务器保存的请求与结果</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify({action:r.action,outcome:r.outcome,authority:r.authority,scoring:r.scoring},null,2)}</pre></details>
  </li>;})}</ol></>}
 </section>;
}
