"use client";
import {useEffect,useRef,useState} from 'react';
import {credentials,assertCurrent} from '../l4/api';
import type {FinalResult} from './types';
import styles from './results.module.css';

type Insight={title:string;behavior:string;emotional_feature:string;relationship:string;suggestion:string};
type Report={title:string;introduction:string;insights:Insight[];semantics:{node:string;option:string;meaning:string;explanation:string;tags:string[]}[];limitation:string};
export function JourneyReport({result}:{result?:FinalResult}){
 const dialog=useRef<HTMLDialogElement>(null);
 const controller=useRef<AbortController|null>(null);
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>controller.current?.abort(),[]);
 function close(){controller.current?.abort();dialog.current?.close();}
 async function load(){
  dialog.current?.showModal();
  if(report||busy)return;
  if(!result){setError('请完成四幕旅程后，在你的结果卡片中查看专属报告。原画预览不生成个人报告。');return;}
  const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
  try{
   const auth=credentials();assertCurrent(auth);
   if(auth.id!==result.session_id)throw Error('journey changed');
   const url=`/api/v1/sessions/${auth.id}/report`;
   for(let attempt=0;attempt<90;attempt++){
    const response=await fetch(url,{method:attempt===0?'POST':'GET',headers:{Authorization:`Bearer ${auth.token}`},cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
    assertCurrent(auth);
    if(!response.ok)throw Error('unavailable');
    const data=await response.json();
    if(data.status==='ready'){
     if(!data.report||!Array.isArray(data.report.insights)||!Array.isArray(data.report.semantics))throw Error('invalid report');
     setReport(data.report);return;
    }
    if(data.status!=='generating')throw Error('generation failed');
    await new Promise<void>((resolve,reject)=>{const onAbort=()=>{clearTimeout(timer);reject(Error('aborted'));};const timer=setTimeout(()=>{abort.signal.removeEventListener('abort',onAbort);resolve();},2000);abort.signal.addEventListener('abort',onAbort,{once:true});});
   }
   throw Error('timeout');
  }catch{if(!abort.signal.aborted)setError('报告暂时无法生成，请稍后重试。');}
  finally{setBusy(false);}
 }
 return <><button type="button" className={`${styles.reportButton} gameYes`} onClick={()=>void load()}>查看报告</button>
 <dialog ref={dialog} data-game-dialog className={`${styles.dialog} ${styles.reportDialog}`} aria-labelledby="report-heading" onCancel={()=>controller.current?.abort()} onClick={e=>{if(e.target===e.currentTarget)close();}}>
 <div className={styles.reportHeader}><h2 id="report-heading">{report?.title||'你的旅程解读'}</h2><button onClick={close} aria-label="关闭报告">关闭 ×</button></div>
 {busy&&<div className={styles.reportLoading} role="status" aria-live="polite"><span className={styles.reportSpinner} aria-hidden="true"/><h3>正在生成你的分析报告</h3><p>生成分析报告大约需要 30 秒，请耐心等待。</p><p className={styles.reportNote}>正在回顾你在旅程中触发的事件与做出的选择…</p></div>}
 {error&&<div role="alert"><p>{error}</p>{result&&<button className="gameYes" onClick={()=>void load()}>重新生成</button>}</div>}
 {report&&<div className={styles.reportContent}><p>{report.introduction}</p><p className={styles.reportNote}>AI 根据本次游戏选择生成 · 供自我探索参考</p>
 <h3>你的事件与行动解读</h3>
 {report.insights.map((item,index)=><section key={index}><h3>{item.title}</h3><p><strong>你的选择：</strong>{item.behavior}</p><p><strong>可能的情感倾向：</strong>{item.emotional_feature}</p><p><strong>在关系中：</strong>{item.relationship}</p><p><strong>可以试试：</strong>{item.suggestion}</p></section>)}
 <details><summary>查看本次选择的解读依据</summary>
 <h3>本次选择与解读</h3><div className={styles.reportTable}><table><thead><tr>{['情境节点','选项','行为语义','情感特征解释','标签'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{report.semantics.map((row,i)=><tr key={i}><td>{row.node}</td><td>{row.option}</td><td>{row.meaning}</td><td>{row.explanation}</td><td>{row.tags.join('、')}</td></tr>)}</tbody></table></div>
 </details><p className={styles.reportNote}>{report.limitation}</p></div>}
 </dialog></>;
}
