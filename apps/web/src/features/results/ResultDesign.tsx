"use client";
import {useRef,useState} from "react";
import {portraits} from "./portraits";
import styles from "./results.module.css";
import type {FinalResult} from "./types";
const sections=[{key:'mode',title:'恋爱模式',icon:'♡'},{key:'strength',title:'你的优势',icon:'♕'},{key:'caution',title:'需要留意',icon:'△'},{key:'advice',title:'给你的建议',icon:'❧'}] as const;
export function ResultDesign({result}:{result?:FinalResult}={}){
 const [index,setIndex]=useState(0);
 const [failed,setFailed]=useState(false);
 const [retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);
 const portrait=portraits[result?Number(result.portrait_id)-1:index];
 const [x,y,width]=portrait.crop; const height=[614,627,635,558,669,642,632,647,599,584,680,629,569,555,594,602][Number(portrait.id)-1];
 function select(next:number){setIndex((next+16)%16);setFailed(false);}
 return <main className={styles.page}>
 <header className={styles.header}>
 <a href={result?"/l4":"/l4?preview=1"} className={styles.brand}>情感密室<span>恋爱性格图鉴</span></a>
 {!result&&<div className={styles.controls}><button onClick={()=>select(index-1)} aria-label="上一幅画像">←</button><select value={index} onChange={e=>select(Number(e.target.value))} aria-label="选择恋爱性格画像">{portraits.map((p,i)=><option key={p.id} value={i}>{p.id} · {p.name}</option>)}</select><button onClick={()=>select(index+1)} aria-label="下一幅画像">→</button></div>}
 <span className={styles.preview}>{result?"你的恋爱性格":`画像预览 · ${portrait.id} / 16`}</span></header>
 {!result&&<p className={styles.previewNote}>画像展示预览 · 尚未生成你的测评结果</p>}
 <article key={portrait.id} className={styles.article} aria-labelledby="portrait-heading">
 <div className={styles.mobileTitle}><p>恋爱性格画像 · {portrait.id}</p><h1 id="portrait-heading">{portrait.name}<span>{portrait.type}</span></h1><blockquote>“{portrait.quote}”</blockquote></div>
 <figure className={styles.hero} style={{aspectRatio:`${width} / ${height}`}}><img key={`${portrait.id}-${retry}`} src={portrait.image} alt={`${portrait.name}，${portrait.type}。${portrait.quote}`} className={styles.art} style={{width:`${1920/width*100}%`,left:`${-x/width*100}%`,top:`${-y/height*100}%`}} onError={()=>setFailed(true)} onLoad={()=>setFailed(false)}/>{failed&&<div className={styles.error} role="alert"><p>画像暂时未能加载</p><button onClick={()=>{setFailed(false);setRetry(retry+1);}}>重新加载</button></div>}</figure>
 <div className={styles.ratings}>{(["authenticity","love"] as const).map((key)=><div key={key}><strong>{key==="authenticity"?"真我值":"恋爱脑"}</strong>{result?.metrics?<><span aria-label={`${result.metrics[key].stars}星，共5星`}>{"★".repeat(result.metrics[key].stars)}{"☆".repeat(5-result.metrics[key].stars)}</span><small>{result.metrics[key].score} 分</small></>:<small>等待结果</small>}</div>)}</div>
 <section className={styles.reading} aria-label={`${portrait.name}的性格解读`}><div className={styles.cards}>{sections.map(s=><section className={styles.card} key={s.key}><h2><span aria-hidden="true">{s.icon}</span>{s.title}</h2><p>{portrait[s.key]}</p></section>)}</div><div className={styles.match}><button disabled><svg aria-hidden="true" width="22" height="26" viewBox="0 0 24 28" fill="none"><rect x="3" y="12" width="18" height="14" rx="3" fill="currentColor"/><path d="M7 12V8a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="3"/><circle cx="12" cy="18" r="2" fill="#b92152"/></svg>找到你的另一半 <span aria-hidden="true">→</span></button><p>匹配功能尚未开放</p></div></section>
 </article><footer className={styles.footer}><p>每一种靠近，都有自己的方式。</p>{!result&&<button onClick={()=>dialog.current?.showModal()}>查看完整原画 ↗</button>}</footer>
 <dialog ref={dialog} className={styles.dialog} aria-label={`${portrait.name}完整原画`} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><form method="dialog"><button aria-label="关闭原画">关闭 ×</button></form><img src={portrait.image} alt={`${portrait.name}完整原画，包含性格介绍及尚未开放的匹配入口设计`}/></dialog>
 </main>;
}



