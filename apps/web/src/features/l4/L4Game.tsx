"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import Link from "next/link";
import {RestartJourney} from "../shared/RestartJourney";
import {LevelHeading} from "../shared/LevelHeading";
import {SAVE_KEY,restore,items,type Item} from "../l3/model";
import {useServerL4} from "./useServerL4";
import {ServerTrace} from "./ServerTrace";
import styles from "./l4.module.css";

const doors=[
  {id:"village",name:"微光门",view:"田园小屋",description:"小路延伸向田园，远处的小屋沐浴在微光里。",left:9.8,width:13.2},
  {id:"coast",name:"静塔门",view:"海岸灯塔",description:"落日映在水面，灯塔静静守着海岸。",left:31.6,width:14.5},
  {id:"forest",name:"森林门",view:"林间小径",description:"石径穿过草地，通向阳光照耀的森林。",left:53.5,width:15.2},
  {id:"castle",name:"宫殿门",view:"花园宫殿",description:"花园尽头，一座宫殿伫立在敞开的铁门之后。",left:76.3,width:13.7},
] as const;
type Door=typeof doors[number];
type RecordEntry={source:"local_preview";door:string;at:string};

export function L4Game({preview}:{preview:boolean}) {
  const server=useServerL4(!preview);
  const [localLoaded,setLoaded]=useState(false),[ready,setReady]=useState(false),[assetError,setAssetError]=useState(false);
  const [attempt,setAttempt]=useState(0),[localError,setError]=useState("");
  const [localItem,setItem]=useState<Item|null>(null),[selected,setSelected]=useState<Door|null>(null),[localConfirmed,setConfirmed]=useState<Door|null>(null);
  const [traceOpen,setTraceOpen]=useState(false),trace=useRef<HTMLDialogElement>(null);
  const loaded=preview?localLoaded:server.loaded;
  const error=preview?localError:server.conflict?"旅程已在其他页面更新，请同步最新进度。":server.error;
  const item=preview?localItem:server.session?.state.item??null;
  const confirmed=preview?localConfirmed:doors.find(d=>d.id===server.session?.state.door)??null;
  const busy=!preview&&server.busy;
  const dialog=useRef<HTMLDialogElement>(null),key=useRef(""),lastRaw=useRef<string|null>(null);
  const resultDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(confirmed&&!selected)resultDialog.current?.showModal();},[confirmed,selected]);
  const back=preview?"/l3?preview=1&segment=carry":"/l3";
  useEffect(()=>{
    let live=true;
    const image=new Image();
    image.onload=()=>{if(live){setReady(true);setAssetError(false);}};
    image.onerror=()=>{if(live){setReady(false);setAssetError(true);}};
    image.src="/game/l4/doors-reference.png";
    return()=>{live=false;};
  },[attempt]);
  useEffect(()=>{
    if(!preview)return;
    let live=true;
    async function load(){
      try{
        let carried:Item|null=null;
        const carryRaw=localStorage.getItem(`${SAVE_KEY}:carry`);
        if(carryRaw)carried=restore(carryRaw,"carry").item;
        if(!live)return;
        key.current="emotional:l4:preview:v1:preview";
        const raw=localStorage.getItem(key.current);
        if(raw){
          const record=JSON.parse(raw) as RecordEntry;
          const door=doors.find(d=>d.id===record.door);
          if(record.source!=="local_preview"||!door||typeof record.at!=="string")throw Error("本地选择记录无法读取，原记录已保留。");
          setConfirmed(door);
        }
        lastRaw.current=raw;setItem(carried);setLoaded(true);
      }catch(e){if(live)setError(e instanceof Error?e.message:"进度读取失败，请重试。");}
    }
    void load();
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key===key.current||event.key===`${SAVE_KEY}:carry`){setError("旅程或本地选择已在其他页面更新，请重新载入。");setSelected(null);}};
    window.addEventListener("storage",changed);
    return()=>{live=false;window.removeEventListener("storage",changed);};
  },[preview]);
  useEffect(()=>{if(selected)dialog.current?.showModal();else dialog.current?.close();},[selected]);
  useEffect(()=>{if(traceOpen)trace.current?.showModal();else trace.current?.close();},[traceOpen]);
  useEffect(()=>{if(!preview&&(server.conflict||server.error))setSelected(null);},[preview,server.conflict,server.error]);
  async function confirm(){
    if(!selected||!loaded||!ready||error||confirmed||busy)return;
    if(!preview){if(await server.confirm(selected.id))setSelected(null);return;}
    try{
      if(localStorage.getItem(key.current)!==lastRaw.current)throw Error("其他页面已更新选择，请重新载入后继续。");
      const raw=JSON.stringify({source:"local_preview",door:selected.id,at:new Date().toISOString()} satisfies RecordEntry);
      localStorage.setItem(key.current,raw);lastRaw.current=raw;setConfirmed(selected);setSelected(null);
    }catch(e){setError(e instanceof Error?e.message:"保存失败，请重新载入后重试。");setSelected(null);}
  }
  return <main className={styles.game}>
    <aside className={styles.rotation}><h2>请翻转手机</h2><p>横屏后，选择你想走向的那扇门。</p></aside>
    <section className={styles.stage} aria-label="第四幕：四扇出口之门">
      <div className={styles.art}>
        <img key={attempt} className={styles.scene} src="/game/l4/doors-reference.png" alt="玫瑰环绕的金色拱廊，四扇门从左到右通向田园小屋、海岸灯塔、森林小径与花园宫殿" onLoad={()=>{setReady(true);setAssetError(false);}} onError={()=>{setReady(false);setAssetError(true);}}/>
      </div>
      <LevelHeading className={styles.heading} ready={ready&&loaded}><p>第四幕 · 出口</p><h1>门的选择</h1></LevelHeading>
      <nav className={styles.back}><RestartJourney/><Link href={back}>← 返回密室</Link>{!preview&&<button aria-label="查看第四幕记录" onClick={()=>setTraceOpen(true)}>☰</button>}</nav>
      {doors.map((door,index)=><button key={door.id} style={{"--left":`${door.left}%`,"--width":`${door.width}%`,"--delay":`${index*90}ms`} as CSSProperties} className={`${styles.door} ${confirmed?.id===door.id?styles.chosen:""}`} aria-label={`${door.name}，${door.view}`} aria-pressed={confirmed?.id===door.id} disabled={!ready||!loaded||!!error||!!confirmed||busy} onClick={()=>setSelected(door)}/>)}
      <footer className={styles.footer}><p role="status">{busy?"正在确认选择…":confirmed?`你选择了${confirmed.name}`:""}</p><span>{item?`随身携带 · ${items[item]}`:"随身物品 · 无"}</span></footer>
      {(!ready||!loaded||error)&&<div className={styles.loading} role={error||assetError?"alert":"status"}><p>{error|| (assetError?"场景图片加载失败。":"正在走出密室…")}</p>{error?<><button disabled={busy} onClick={()=>preview?window.location.reload():void server.sync()}>{preview?"重新载入":"重试同步"}</button><Link href={back}>返回第三幕</Link></>:assetError?<button onClick={()=>{setAssetError(false);setAttempt(v=>v+1);}}>重新加载图片</button>:null}</div>}
    </section>
    <dialog ref={dialog} className={styles.dialog} onCancel={()=>setSelected(null)} aria-labelledby="door-title">
      {selected&&<><p className={styles.eyebrow}>出口 · {selected.view}</p><h2 id="door-title">要走进{selected.name}吗？</h2><p>{selected.description}</p><div className={styles.actions}><button autoFocus disabled={busy} onClick={()=>setSelected(null)}>再看看</button><button className={styles.primary} disabled={busy||!!error} onClick={confirm}>{busy?"正在确认…":"走进这扇门"}</button></div></>}
    </dialog>
    {confirmed&&<button className={styles.resultEntry} onClick={()=>resultDialog.current?.showModal()}>查看恋爱性格</button>}
    <dialog ref={resultDialog} className={styles.dialog} aria-labelledby="result-title"><p className={styles.eyebrow}>旅程的终点</p><h2 id="result-title">来看看你的恋爱性格吧</h2><p>每一次选择，都留下了属于你的印记。</p><div className={styles.actions}><button onClick={()=>resultDialog.current?.close()}>稍后再看</button><Link className={styles.primary} href={preview?"/results?preview=1":"/results"}>查看我的恋爱性格 →</Link></div></dialog>
    <dialog ref={trace} className={styles.dialog} onCancel={()=>setTraceOpen(false)} aria-label="第四幕服务器记录"><button onClick={()=>setTraceOpen(false)}>关闭记录</button>{traceOpen&&<ServerTrace sessionId={server.session?.id}/>}</dialog>
  </main>;
}
