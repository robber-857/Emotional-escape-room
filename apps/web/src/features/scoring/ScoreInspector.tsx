"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import type {ScoreSummary,ScoreAction,Vector} from "./types";
import {ProximityDetails} from "../l2/ProximityDetails";
import styles from "./scoring.module.css";

const reasons:Record<string,string>={APPLIED:"已计分",AWAITING_L3_ENTRY:"已保存最新确认，进入第三幕时结算",AWAITING_FIRST_SEAT_OR_TABLE:"尚未选择座位；首次坐下或到桌边时结算",AWAITING_STORM_CUTOFF:"已记录，等待风暴六项回答完成后结算",AWAITING_ITEM_CONFIRMATION:"已记录，等待确认携带物品",REJECTED:"服务器拒绝，未计分",ALREADY_SCORED:"已结算，重复不计分",NO_SCORE_ON_NO:"此否选项无分数影响",WAITING_FOR_COMPONENTS:"等待组合完整",AWAITING_FINALIZATION:"等待场景结束结算",MECHANICAL_STEP:"过程动作，不单独加分",NOT_MEASURED:"此结果不测量分数",UNCONFIGURED:"结果分值待配置",UNCONFIGURED_CONDITION:"评分条件／截止点待配置",QUARTILE_POOL_NOT_CONFIGURED:"四档边界待配置",MISSING_QUARTILE_THRESHOLDS:"四档边界待配置",MISSING_VALUES:"部分结果缺分值",MISSING_CONDITION:"事件条件待定义",INSUFFICIENT_EVIDENCE:"评分证据不足",LEGACY_UNBOUND:"旧旅程未绑定评分版本"};
const number=(n:number|null|undefined)=>n==null?"—":Number(n.toFixed(2)).toString();
const vector=(v:Vector|null)=>v?Object.entries(v).map(([a,n])=>`${a} ${n===null?"NA":n>0?"+"+n:n}`).join(" · "):"无评分向量";
const actionLabel=(a:ScoreAction["action"])=>{const key=a.seat||a.choice||a.slot||a.type;const names:Record<string,string>={"table-seat":"坐桌前椅（中心椅）",chair:"坐窗边椅",open:"开门",close:"关门",wait:"等待",curtain:"窗帘",window:"窗户",television:"电视","layout-confirm":"确认摆放","furniture-finalize":"进入第三幕：结算最后确认的摆放"};return `${names[key]||key}${typeof a.yes==="boolean"?`（${a.yes?"是":"否"}）`:""}`;};
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
  <button className={styles.toggle} aria-expanded={open} onClick={()=>setOpen(!open)}>服务端计分 {latest?`· ${reasons[latest.reason]||latest.reason}`:""} <span>{open?"收起":"展开"}</span></button>
  {open&&<div className={styles.panel}>
   <h2>计分测试台</h2><p className={styles.muted}>每秒读取服务器账本。点击、动画、本机预览不会生成这里的加分。</p>
   {error&&<div role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试读取计分</button></div>}
   {empty&&<p>{empty}</p>}
   {data?.status==="legacy_normalization"&&<p>这段旅程绑定的是旧评分规则，已停止展示。请开始新旅程使用四维算法；历史回执保留。</p>}
   {data?.status==="legacy_unbound"&&<p>这段旧旅程没有绑定评分版本。请从第一幕开始新旅程测试；旧记录不会自动补分。</p>}
   {data?.status==="active"&&<>
    <p className={styles.muted}>分值版本 {data.event_score_version} · 权重版本 {data.weight_version}</p>
    <table><caption>每关 A/V/T/F 独立评分</caption><thead><tr><th>关卡／维度</th><th>原始分</th><th>0–100</th><th>状态</th></tr></thead><tbody>{Object.values(data.levels).flatMap(l=>Object.entries(l.axes).map(([axis,v])=><tr key={`${l.level}:${axis}`}><td>{l.level.toUpperCase()} · {axis} · {l.weight*100}%</td><td>{number(v.raw)}</td><td>{v.status==="not_measured"?"NA":number(v.normalized??v.provisional)}{v.normalized===null&&v.provisional!==null?"*":""}</td><td>{v.status==="pending_configuration"?"待配置":v.status==="not_measured"?"未测量":v.status==="final"?"已结算":"进行中"}</td></tr>))}</tbody></table>
    <p className={styles.muted}>* 暂算值。每个维度独立归一化和加权，NA 不作为零分；缺配置不会被跳过。</p>
    <h3>最终四维（各 0–100）</h3><p>{Object.entries(data.final?.vector||{}).map(([a,v])=>`${a} ${number(v)}`).join(" · ")}</p>
    <p>真我值（T）：{data.final?.metrics.authenticity?`${number(data.final.metrics.authenticity.score)} 分 · ${data.final.metrics.authenticity.stars}/5 星`:"待结算"}；恋爱脑指数（F）：{data.final?.metrics.love?`${number(data.final.metrics.love.score)} 分 · ${data.final.metrics.love.stars}/5 星`:"待结算"}</p>
    <details><summary>各维度范围与待配置原因</summary>{Object.values(data.levels).map(l=><div key={l.level}><h3>{l.level.toUpperCase()}</h3>{Object.entries(l.axes).map(([axis,v])=><p key={axis}>{axis} 理论原始范围 [{v.lower}, {v.upper}]；归一化 = 100 × (该维原始分 − 下限) / (上限 − 下限)</p>)}{Object.entries(l.pending_details).map(([g,rs])=><p key={g}>{g}：{rs.map(r=>reasons[r]||r).join("、")}</p>)}</div>)}</details>
    <h3>最近服务器判定（最多 100 条）</h3>
    {!data.actions.length&&<p>尚未收到操作回执。</p>}
    <ol className={styles.events}>{data.actions.map(a=><li key={`${a.level}:${a.action_id}`} data-score-action-id={a.action_id}>
     <strong>{a.level.toUpperCase()} · {actionLabel(a.action)} — {reasons[a.reason]||a.reason}</strong>
     <p>本次四维变化：{vector(a.delta)}</p>
     {a.code==="LAYOUT_OUTSIDE_FLOOR"&&<p>超出地面：{a.diagnostic?.outsideFloor.map(k=>({armchair:"单人沙发",sofa:"双人沙发",chair:"窗边椅","table-chair":"桌椅组合"}[k]||k)).join("、")}。移回地面后可以再次确认；本次没有锁定评分。</p>}
     {a.settlement&&<p>这条操作当时尚未回答：{a.settlement.remaining_slots.map(k=>({open:"开门",close:"关门",wait:"等待",curtain:"窗帘",window:"窗户",television:"电视"}[k]||k)).join("、")||"无"}。{a.settlement.door_locked?"开门后关门组合已固定，可立即结算。":"含“否”的结果仍可修改，风暴六项回答齐全时统一结算。"} 历史操作回执保持原样，最终得分见对应结算事件。</p>}
     {a.events.map((e,i)=><p key={i}>{e.group_id.startsWith("l2.furniture.")?`${({"l2.furniture.wall":"靠墙／窗程度","l2.furniture.tidiness":"整齐度","l2.furniture.adjustments":"调整次数"} as Record<string,string>)[e.group_id]}${/^[1-4]$/.test(e.option_id)?`：第 ${e.option_id}/4 档`:""}`:`${e.label||e.group_id} / ${e.option_id}`}：{reasons[e.reason]||e.reason} · {vector(e.vector)}</p>)}
     {a.events.filter(e=>e.group_id==="l2.furniture.wall").map((e,i)=><ProximityDetails key={i} rows={e.evidence?.placement?.evidence?.wallProximityByObject}/>)}
     <details><summary>查看事件 ID 与结算依据</summary><p>{a.action_id} · 服务端版本 {a.version} · {a.code}</p><p>动作后四维：{Object.entries(a.level_score.axes).map(([k,v])=>`${k} 原始 ${number(v.raw)} / 暂算 ${number(v.provisional)}`).join("；")}</p><pre>{JSON.stringify(a.events,null,2)}</pre></details>
    </li>)}</ol>
   </>}
  </div>}
 </aside>;
}
