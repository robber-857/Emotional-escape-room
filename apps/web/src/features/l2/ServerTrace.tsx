"use client";
import {useEffect,useState} from "react";
import {credentials,getReceipts,type Receipt} from "./api";
import styles from "./l2.module.css";
import {PlacementEvidence} from "./PlacementEvidence";

export function ServerTrace({sessionId}:{sessionId:string|undefined}){
 const [rows,setRows]=useState<Receipt[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const [attempt,setAttempt]=useState(0);const [filter,setFilter]=useState("all");
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setRows([]);
  async function load(){
   try{const auth=credentials();if(!sessionId||auth.id!==sessionId)throw new Error("旅程已切换，请关闭记录并重新载入。");
    const result=await getReceipts(auth);if(!Array.isArray(result))throw new Error("服务器回执格式无效。");
    if(active)setRows(result);
   }catch(e){if(active)setError(e instanceof Error?e.message:"无法读取服务器记录。");}
   finally{if(active)setLoading(false);}
  }
  void load();return()=>{active=false;};
 },[sessionId,attempt]);
 const visible=rows.filter(r=>filter==="all"||(filter==="accepted"&&r.accepted)||(filter==="rejected"&&!r.accepted)||(filter==="timing"&&r.action.type==="search-time"));
 return <section className={styles.serverTrace} aria-label="服务器回执列表">
  <h2>服务器选择记录</h2>
  <p>本列表唯一数据源：服务器数据库回执。前端只提交动作请求，接受或拒绝、状态版本与结果均由服务器判定。</p>
  <p>会话：{sessionId||"尚未连接"}。整理房间指标与计分状态见各次确认回执；其他评分待配置。寻找时长来自客户端活动报告，服务器约束校验不等于独立测量。</p>
  <div className={styles.actions}>
   <label>显示记录 <select aria-label="筛选服务器记录" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="accepted">服务器接受</option><option value="rejected">服务器拒绝</option><option value="timing">计时报告</option></select></label>
   <button disabled={loading} onClick={()=>setAttempt(n=>n+1)}>刷新服务器记录</button>
  </div>
  {loading&&<p role="status">正在读取服务器回执…</p>}
  {error&&<div role="alert"><p>读取服务器记录失败：{error}</p><button onClick={()=>setAttempt(n=>n+1)}>重试读取记录</button></div>}
  {!loading&&!error&&<>
   <p role="status">服务器返回 {rows.length} 条回执，当前显示 {visible.length} 条。重复请求不新增回执；结构校验失败或身份校验失败的请求不进入业务回执表。</p>
   {!visible.length&&<p>暂无符合条件的服务器回执。</p>}
   <ol>{visible.map(r=><li key={r.action_id} data-action-id={r.action_id} data-source={r.authority.record_source} data-accepted={String(r.accepted)}>
    <strong>{r.accepted?"服务器接受":"服务器拒绝"} · {r.action.type}</strong>
    <p>来源：{r.authority.record_source==="server_database"&&r.authority.decision_source==="server"?"服务器数据库 · 服务器判定":"来源未确认"}；输入：客户端动作请求。</p>
    <dl><dt>事件 ID</dt><dd>{r.action_id}</dd><dt>服务器接收时间</dt><dd>{r.received_at}</dd><dt>状态版本</dt><dd>{r.previous_version===undefined?"旧回执未记录前版本":r.previous_version} → {r.version}</dd><dt>判定</dt><dd>{r.code}</dd><dt>规则 / 校验版本</dt><dd>{r.rules_version} / {r.validation_version||"旧回执未记录"}</dd></dl>
    {r.action.type==="search-time"&&<p>计时可信度：客户端上报，服务器约束校验；未验证真实活动时间。</p>}
    {r.action.type==="layout-confirm"&&<PlacementEvidence scoring={r.scoring}/>}
    <details><summary>查看服务器保存的请求与结果</summary><p>动作请求</p><pre>{JSON.stringify(r.action,null,2)}</pre>
     <p>服务器事件结果</p>{r.outcome?<pre>{JSON.stringify(r.outcome,null,2)}</pre>:<p>{r.accepted?"历史回执未保存逐事件结果，不从当前状态反推。":"请求被拒绝，未推进状态。"}</p>}
     <p>评分与证据</p><pre>{JSON.stringify(r.scoring,null,2)}</pre>
    </details>
   </li>)}</ol>
  </>}
 </section>;
}
