"use client";
import {useRef,useState} from "react";
import {portraits} from "./portraits";
import styles from "./results.module.css";
import type {FinalResult} from "./types";
import {resolveRatingCopy} from "./rating-copy";
// Shared rating bounds on the approved 2048 × 1365 portrait cards.
// Official metrics cover the decorative ratings embedded in the artwork.
const ratingPanels=[[62,717,932,148],[1054,717,932,148]];
const sections=[{key:'mode',title:'恋爱模式'},{key:'strength',title:'你的优势'},{key:'caution',title:'需要留意'},{key:'advice',title:'给你的建议'}] as const;
export type MatchRequest = {portraitId:string;source:"result"|"preview"};
// Future matching integration belongs in a client-side caller; no service is called by default.
export function ResultDesign({result,onMatchRequest}:{result?:FinalResult;onMatchRequest?:(request:MatchRequest)=>void}={}){
 const [index,setIndex]=useState(0),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);
 const matchDialog=useRef<HTMLDialogElement>(null);
 const portrait=portraits[result?Number(result.portrait_id)-1:index];
 function select(next:number){setIndex((next+16)%16);setFailed(false);}
 function requestMatch(){
  if(onMatchRequest)onMatchRequest({portraitId:portrait.id,source:result?"result":"preview"});
  else matchDialog.current?.showModal();
 }
 function artwork(){return <><figure className={styles.originalPoster}>
 <img key={`${portrait.id}-${retry}`} src={portrait.image} width={2048} height={1365} alt={`${portrait.name}，${portrait.type}。${portrait.quote}`} onError={()=>setFailed(true)} onLoad={()=>setFailed(false)}/>
 {result?.metrics&&(['authenticity','love'] as const).map((key,i)=>{const [x,y,w,h]=ratingPanels[i];const metric=result.metrics![key]!;return <div key={key} className={styles.originalRating} style={{left:`${x/2048*100}%`,top:`${y/1365*100}%`,width:`${w/2048*100}%`,height:`${h/1365*100}%`}} aria-label={`${i===0?'真我值':'恋爱脑'}：${metric.score}分，${metric.stars}星，共5星`}><strong>{i===0?'真我值':'恋爱脑'}</strong><span className={i===0?styles.goldStars:styles.pinkHearts} aria-hidden="true">{Array.from({length:5},(_,n)=><i key={n} style={{opacity:n<metric.stars?1:.18}}>{i===0?'★':'♥'}</i>)}</span></div>;})}
 {failed&&<div className={styles.error} role="alert"><p>画像暂时未能加载</p><button onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>重新加载</button></div>}
 </figure>
 <div className={`${styles.match} ${styles.matchEntry}`}><button type="button" onClick={requestMatch}><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>找到你的另一半<span aria-hidden="true">→</span></button></div>
 </>;}
 return <main className={styles.page}>
 <header className={styles.header}><a href={result?'/l4':'/l4?preview=1'} className={styles.brand}>情感密室<span>恋爱性格图鉴</span></a>
 {!result&&<div className={styles.controls}><button onClick={()=>select(index-1)} aria-label="上一幅画像">←</button><select value={index} onChange={e=>select(Number(e.target.value))} aria-label="选择恋爱性格画像">{portraits.map((p,i)=><option key={p.id} value={i}>{p.id} · {p.name}</option>)}</select><button onClick={()=>select(index+1)} aria-label="下一幅画像">→</button></div>}
 <span className={styles.preview}>{result?'你的恋爱性格':`原画预览 · ${portrait.id} / 16`}</span></header>
 {!result&&<p className={styles.previewNote}>原画预览 · 图中星级为原图内容，不代表你的测评结果</p>}
 <article key={portrait.id} className={styles.article} aria-labelledby="portrait-heading">
 <div className={styles.screenReader}><h1 id="portrait-heading">{portrait.name} · {portrait.type}</h1><p>{portrait.quote}</p>{sections.map(s=><section key={s.key}><h2>{s.title}</h2><p>{portrait[s.key]}</p></section>)}</div>
 {artwork()}
 {result?.metrics&&<section className={styles.reading} aria-label="你的星级解读"><p className={styles.finalScores}>最终评分：{(['A','V','T','F'] as const).map(axis=>`${axis} ${result.vector?.[axis]?.toFixed(2)??'—'}`).join(' · ')}（满分 100）</p><div className={`${styles.cards} ${styles.ratingCopy}`}>
 {(['authenticity','love'] as const).map(key=>{const metric=result.metrics![key]!,copy=resolveRatingCopy(portrait.id,key,metric.stars);return <section key={key} className={styles.card}><h2>{key==='authenticity'?'真我值':'恋爱脑'} · {metric.stars}/5 星</h2><p>{metric.score.toFixed(2)} / 100</p>{copy&&<><h3>{copy.title}</h3><p>{copy.body}</p></>}</section>;})}
 </div></section>}
 </article>
 <footer className={styles.footer}><p>匹配功能即将开放</p><button onClick={()=>dialog.current?.showModal()}>放大查看卡片 ↗</button></footer>
 <dialog ref={dialog} className={`${styles.dialog} ${styles.posterDialog}`} aria-label={`${portrait.name}放大卡片`} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><form method="dialog"><button aria-label="关闭原画">关闭 ×</button></form><div className={styles.zoomCanvas}>{artwork()}</div></dialog>
 <dialog ref={matchDialog} className={`${styles.dialog} ${styles.matchDialog}`} aria-labelledby="match-heading" onClick={e=>{if(e.target===e.currentTarget)matchDialog.current?.close();}}><h2 id="match-heading">匹配功能即将开放</h2><p>开放后，可在这里寻找与你匹配的人。</p><form method="dialog"><button autoFocus>知道了</button></form></dialog>
 </main>;
}
