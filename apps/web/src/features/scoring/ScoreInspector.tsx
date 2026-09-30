"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import type {ScoreSummary,Vector} from "./types";
import styles from "./scoring.module.css";

const reasons:Record<string,string>={APPLIED:"已计分",REJECTED:"服务器拒绝，未计分",ALREADY_SCORED:"已结算，重复不计分",NO_SCORE_ON_NO:"此否选项无分数影响",WAITING_FOR_COMPONENTS:"等待组合完整",AWAITING_FINALIZATION:"等待场景结束结算",MECHANICAL_STEP:"过程动作，不单独加分",NOT_MEASURED:"此结果不测量分数",UNCONFIGURED:"结果分值待配置",UNCONFIGURED_CONDITION:"评分条件／截止点待配置",QUARTILE_POOL_NOT_CONFIGURED:"四分位样本池待配置",INSUFFICIENT_EVIDENCE:"评分证据不足",LEGACY_UNBOUND:"旧旅程未绑定评分版本"};
const number=(n:number|null|undefined)=>n==null?"—":Number(n.toFixed(2)).toString();
const vector=(v:Vector|null)=>v?Object.entries(v).map(([a,n])=>`${a} ${n===null?"NA":n>0?"+"+n:n}`).join(" · "):"无评分向量";
export function ScoreInspector(){
 const path=usePathname();const [open,setOpen]=useState(false),[data,setData]=useState<ScoreSummary|null>(null),[error,setError]=useState(""),[empty,setEmpty]=useState(""),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true,busy=false,lastSession="";const controller=new AbortController();
  setData(null);setError("");setEmpty("");
  async function load(){
   if(busy||document.visibilityState!=="visible")return;
   busy=true;
   try{
    if(new URLSearchParams(window.location.search).get("preview")==="1"||path==="/results/design"){setData(null);setEmpty("本机预览不产生服务端评分，请进入正式旅程测试。");return;}
    const raw=localStorage.getItem("emotional:l1:server:v1");const auth=raw?JSON.parse(raw):null;
    if(!auth?.id||!auth?.token){setData(null);setEmpty("开始一段新旅程后，这里显示服务端实际计分。");return;}
    if(auth.id!==lastSession){setData(null);lastSession=auth.id;}
    const response=await fetch(`/api/v1/sessions/${auth.id}/scoring`,{headers:{Authorization:`Bearer ${auth.token}`},cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
    const current=JSON.parse(localStorage.getItem("emotional:l1:server:v1")||"null");
    if(!active||current?.id!==auth.id)return;
    if(!response.ok)throw Error(`读取服务端计分失败（${response.status}）`);
    const value=await response.json();if(value.source!=="server_database"||value.session_id!==auth.id)throw Error("评分来源校验失败");
    setData(value);setError("");setEmpty("");
   }catch(e){if(active){setData(null);setError(e instanceof Error?e.message:"无法读取计分");}}
   finally{busy=false;}
  }
  void load();const timer=setInterval(()=>void load(),1000);
  return()=>{active=false;controller.abort();clearInterval(timer);};
 },[path,retry]);
 const latest=data?.actions[0];
 return <aside className={styles.inspector} aria-label="服务端计分测试">
  <button className={styles.toggle} aria-expanded={open} onClick={()=>setOpen(!open)}>服务端计分 {latest?`· ${reasons[latest.reason]||latest.reason}${latest.raw_total_delta!==null?` ${latest.raw_total_delta>0?"+":""}${latest.raw_total_delta}`:""}`:""} <span>{open?"收起":"展开"}</span></button>
  {open&&<div className={styles.panel}>
   <h2>计分测试台</h2><p className={styles.muted}>每秒读取服务器账本。点击、动画、本机预览不会生成这里的加分。</p>
   {error&&<div role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试读取计分</button></div>}
   {empty&&<p>{empty}</p>}
   {data?.status==="legacy_unbound"&&<p>这段旧旅程没有绑定评分版本。请从第一幕开始新旅程测试；旧记录不会自动补分。</p>}
   {data?.status==="active"&&<>
    <p className={styles.muted}>分值版本 {data.event_score_version} · 权重版本 {data.weight_version}</p>
    <table><caption>各关卡累计分</caption><thead><tr><th>关卡／权重</th><th>原始分</th><th>0–100</th><th>状态</th></tr></thead><tbody>{Object.values(data.levels).map(l=><tr key={l.level}><td>{l.level.toUpperCase()} · {l.weight*100}%</td><td>{number(l.total.raw)}</td><td>{number(l.total.normalized??l.total.provisional)}{l.total.normalized===null&&l.total.provisional!==null?"*":""}</td><td>{l.pending_groups.length?"缺配置":l.complete?"已结算":"进行中"}</td></tr>)}</tbody></table>
    <p className={styles.muted}>* 已配置部分的暂算值；完成全部关卡且配置齐全后才生成正式总分。NA 表示未测量，0 表示明确的零分。</p>
    <p><strong>最终加权分：{number(data.final?.score)} / 100</strong> · {data.final?.status==="ready"?"已完成":data.final?.status==="in_progress"?"等待四关完成":"等待缺失评分配置"}</p>
    <details><summary>归一化范围与四维明细</summary>{Object.values(data.levels).map(l=><div key={l.level}><h3>{l.level.toUpperCase()}</h3><p>理论总分范围 [{l.total.lower}, {l.total.upper}]；公式：100 × (原始分 − 最低分) / (最高分 − 最低分)</p><p>{Object.entries(l.axes).map(([axis,v])=>`${axis} 原始 ${number(v.raw)} / 归一化 ${number(v.normalized??v.provisional)}`).join("；")}</p>{l.pending_groups.length>0&&<p>待配置：{l.pending_groups.join("、")}</p>}</div>)}</details>
    <h3>最近服务器判定（最多 100 条）</h3>
    {!data.actions.length&&<p>尚未收到操作回执。</p>}
    <ol className={styles.events}>{data.actions.map(a=><li key={`${a.level}:${a.action_id}`} data-score-action-id={a.action_id}>
     <strong>{a.level.toUpperCase()} · {a.action.choice||a.action.slot||a.action.type} — {reasons[a.reason]||a.reason}</strong>
     <p>本次原始总分变化：{number(a.raw_total_delta)}；{vector(a.delta)}</p>
     {a.events.map((e,i)=><p key={i}>{e.label||e.group_id} / {e.option_id}：{reasons[e.reason]||e.reason} · {vector(e.vector)}</p>)}
     <details><summary>查看事件 ID 与结算依据</summary><p>{a.action_id} · 服务端版本 {a.version} · {a.code}</p><p>动作后关卡原始分 {number(a.level_score.total.raw)}，归一化暂算 {number(a.level_score.total.provisional)}</p><pre>{JSON.stringify(a.events,null,2)}</pre></details>
    </li>)}</ol>
   </>}
  </div>}
 </aside>;
}
