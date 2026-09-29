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
  <ol>{rows.map(r=>{const verified=r.authority?.record_source==="server_database"&&r.authority?.decision_source==="server"&&r.authority?.input_source==="client_claim";const v=r.validation;return <li key={r.action_id} data-action-id={r.action_id} data-source={r.authority?.record_source||"unknown"} data-accepted={String(r.accepted)}>
   <strong>{r.accepted?"服务器接受":"服务器拒绝"} · {describe(r.action)}</strong><p>{r.code} · 版本 {r.previous_version} → {r.version}</p><small>{r.received_at} · {r.action_id}</small><p>{r.rules_version} / {r.validation_version}</p>
   <p data-testid="receipt-authority">{verified?"唯一记录来源：服务器数据库；唯一判定来源：服务器。":"来源标识未确认，不将本条声明为已验证的服务器记录。"}</p>
   <p>输入来源：{r.authority?.input_source==="client_claim"?"客户端动作请求；前端点击本身不代表动作通过或已保存。":"旧回执未明确输入来源。"}</p>
   <p>{r.state_changed?"服务器已接受并推进状态。":r.accepted?"服务器确认重复选择，未增加流程事件。":"服务器已拒绝，未推进状态。"}</p>
   {v?.source==="server"?<div data-testid="receipt-validation"><p>服务器保存的校验依据：</p><ul>
    <li>会话鉴权：{v.authenticated?"通过":"未通过"}；L1 / L2 完成前置：{v.l1_complete&&v.l2_complete?"通过":"未通过"}。</li>
    <li>规则版本：{v.rules_supported?"支持":"不支持"}；期望版本 {v.expected_version}，服务器当时版本 {v.actual_version}：{v.version_matches?"一致":"冲突"}。</li>
    <li>流程校验：{!v.flow_evaluated?"未执行（先前校验未通过）":v.flow_allowed?"通过":"未通过"}；事件额度：{v.event_budget_allowed===null?"未执行":v.event_budget_allowed?"通过":"未通过"}。</li>
   </ul></div>:<p>旧回执未保存逐项校验依据；不从当前状态补造。</p>}
   <details><summary>服务器保存的请求与结果</summary><pre data-testid="receipt-json" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify({action:r.action,outcome:r.outcome,authority:r.authority,validation:r.validation,scoring:r.scoring},null,2)}</pre></details>
  </li>;})}</ol></>}
 </section>;
}
