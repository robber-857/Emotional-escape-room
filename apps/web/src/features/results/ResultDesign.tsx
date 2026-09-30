"use client";
import {useRef,useState} from "react";
import {portraits} from "./portraits";
import styles from "./results.module.css";
import type {FinalResult} from "./types";
// Original artwork coordinates, on the supplied 1920 × 1280 reference canvas.
// Only these two rating panels are replaced when an authoritative result exists.
const ratingPanels=[
 [[130,632,733,128],[979,632,830,128]],[[131,636,750,126],[991,636,842,126]],
 [[120,645,750,120],[980,645,860,120]],[[260,614,655,113],[994,614,710,113]],
 [[97,677,820,131],[1016,677,838,131]],[[109,649,761,125],[976,649,856,125]],
 [[124,637,762,126],[1010,637,834,126]],[[96,655,716,107],[1360,655,498,107]],
 [[118,606,760,123],[972,606,862,123]],[[139,603,769,122],[984,603,821,122]],
 [[117,688,766,122],[982,688,846,122]],[[114,637,627,118],[1006,637,832,118]],
 [[114,576,775,117],[984,576,857,117]],[[117,578,778,117],[996,578,834,117]],
 [[122,600,768,124],[980,600,848,124]],[[112,609,778,129],[990,609,859,129]],
];
const sections=[{key:'mode',title:'恋爱模式'},{key:'strength',title:'你的优势'},{key:'caution',title:'需要留意'},{key:'advice',title:'给你的建议'}] as const;
export function ResultDesign({result}:{result?:FinalResult}={}){
 const [index,setIndex]=useState(0),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);
 const portrait=portraits[result?Number(result.portrait_id)-1:index];
 function select(next:number){setIndex((next+16)%16);setFailed(false);}
 function artwork(){return <figure className={styles.originalPoster}>
 <img key={`${portrait.id}-${retry}`} src={portrait.image} width={2508} height={1672} alt={`${portrait.name}，${portrait.type}。${portrait.quote}`} onError={()=>setFailed(true)} onLoad={()=>setFailed(false)}/>
 {result?.metrics&&(['authenticity','love'] as const).map((key,i)=>{const [x,y,w,h]=ratingPanels[Number(portrait.id)-1][i];const metric=result.metrics![key];return <div key={key} className={styles.originalRating} style={{left:`${x/1920*100}%`,top:`${y/1280*100}%`,width:`${w/1920*100}%`,height:`${h/1280*100}%`}} aria-label={`${i===0?'真我值':'恋爱脑'}：${metric.score}分，${metric.stars}星，共5星`}><strong>{i===0?'真我值':'恋爱脑'}</strong><span className={i===0?styles.goldStars:styles.pinkHearts} aria-hidden="true">{Array.from({length:5},(_,n)=><i key={n} style={{opacity:n<metric.stars?1:.18}}>{i===0?'★':'♥'}</i>)}</span></div>;})}
 {failed&&<div className={styles.error} role="alert"><p>画像暂时未能加载</p><button onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>重新加载</button></div>}
 </figure>;}
 return <main className={styles.page}>
 <header className={styles.header}><a href={result?'/l4':'/l4?preview=1'} className={styles.brand}>情感密室<span>恋爱性格图鉴</span></a>
 {!result&&<div className={styles.controls}><button onClick={()=>select(index-1)} aria-label="上一幅画像">←</button><select value={index} onChange={e=>select(Number(e.target.value))} aria-label="选择恋爱性格画像">{portraits.map((p,i)=><option key={p.id} value={i}>{p.id} · {p.name}</option>)}</select><button onClick={()=>select(index+1)} aria-label="下一幅画像">→</button></div>}
 <span className={styles.preview}>{result?'你的恋爱性格':`原画预览 · ${portrait.id} / 16`}</span></header>
 {!result&&<p className={styles.previewNote}>原画预览 · 图中星级为原图内容，不代表你的测评结果</p>}
 <article key={portrait.id} className={styles.article} aria-labelledby="portrait-heading">
 <div className={styles.screenReader}><h1 id="portrait-heading">{portrait.name} · {portrait.type}</h1><p>{portrait.quote}</p>{sections.map(s=><section key={s.key}><h2>{s.title}</h2><p>{portrait[s.key]}</p></section>)}</div>
 {artwork()}
 </article>
 <footer className={styles.footer}><p>画中的匹配入口尚未开放</p><button onClick={()=>dialog.current?.showModal()}>放大查看卡片 ↗</button></footer>
 <dialog ref={dialog} className={`${styles.dialog} ${styles.posterDialog}`} aria-label={`${portrait.name}放大卡片`} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><form method="dialog"><button aria-label="关闭原画">关闭 ×</button></form><div className={styles.zoomCanvas}>{artwork()}</div></dialog>
 </main>;
}
