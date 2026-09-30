"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {credentials,assertCurrent} from '../l4/api';
import {ResultDesign} from './ResultDesign';
import type {FinalResult} from './types';
import styles from './results.module.css';
export function ResultPage({preview}:{preview:boolean}){
 const [data,setData]=useState<FinalResult|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
 if(preview)return;
 const controller=new AbortController();let live=true;
 async function load(){
 setData(null);setError('');
 try{const auth=credentials();const response=await fetch(`/api/v1/sessions/${auth.id}/result`,{headers:{Authorization:`Bearer ${auth.token}`},cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});const value=await response.json();assertCurrent(auth);
 if(!response.ok)throw Error(response.status===409?'请先完成四幕旅程，再查看你的恋爱性格。':response.status===404?'未找到这段旅程，请返回关卡确认进度。':'结果暂时无法读取，请重试。');
 if(value.session_id!==auth.id||value.source!=='server_database'||value.schema_version!=='result-v1'||!['ready','pending_configuration'].includes(value.status))throw Error('结果响应无效，请重试。');
 if(value.status==='ready'&&(!/^(0[1-9]|1[0-6])$/.test(value.portrait_id)||!value.policy_version||!value.vector||!['A','V','T','F'].every(k=>Number.isFinite(value.vector[k]))||!['authenticity','love'].every(k=>{const m=value.metrics?.[k];return m&&Number.isFinite(m.score)&&m.score>=0&&m.score<=100&&m.stars===Math.min(5,Math.floor(m.score/20)+1);})))throw Error('结果数据不完整，请重试。');
 if(live)setData(value);
 }catch(e){if(live)setError(e instanceof Error?e.message:'结果暂时无法读取，请重试。');}}
 void load();return()=>{live=false;controller.abort();};
 },[preview,attempt]);
 if(preview)return <ResultDesign/>;
 if(data?.status==='ready')return <ResultDesign result={data}/>;
 return <main className={styles.page}><section className={styles.pending}><p>情感密室 · 旅程终点</p><h1>{error?'暂时无法展开画像':data?'你的旅程已完成':'正在展开你的画像…'}</h1><p role={error?'alert':'status'}>{error||(data?'你的选择已保存，恋爱性格画像正在等待生成。':'正在读取你的旅程记录。')}</p><section aria-label="四关计分汇总">{data?.score_summary?.status==="active"&&<><h2>四关计分汇总</h2>{Object.values(data.score_summary.levels).map(l=><p key={l.level}>{l.level.toUpperCase()} · 权重 {l.weight*100}%：{l.total.normalized!==null?`${l.total.normalized.toFixed(2)} / 100`:`暂算 ${l.total.provisional?.toFixed(2)??"—"}，评分配置待补齐`}</p>)}<p><strong>最终加权总分：{data.score_summary.final?.score?.toFixed(2)??"待配置"}</strong></p><p>逐事件增减分与四维明细见右下角“服务端计分”。分数与人格画像分别生成。</p></>}</section><div>{data?.status==="pending_configuration"&&<Link className={styles.previewEntry} href="/results/design">预览 16 种性格卡片 →</Link>}{(error||data)&&<button onClick={()=>setAttempt(v=>v+1)}>重新查看</button>}<Link href="/l4">返回出口</Link></div></section></main>;
}

