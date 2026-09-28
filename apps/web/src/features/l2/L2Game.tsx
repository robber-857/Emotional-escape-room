"use client";
import {furniture,moveLayout,type FurnitureId,type Point} from "./layout";
import {useEffect,useRef,useState} from "react";
import {LayoutButton} from "./LayoutButton";
import {SearchClock} from "./searchClock";
import Link from "next/link";
import {Scene,KeySprite,assets} from "./Scene";
import {initialState,transition,restore,keysAvailable,seatNames,keyNames,SAVE_KEY,type Seat,type State,type Action,type KeyId} from "./model";
import styles from "./l2.module.css";
type Prompt = {type:"layout-confirm"}|{type:"layout-reset"}| {type:"search"}|{type:"return"}|{type:"found"}| {type:"seat";seat:Seat}|{type:"keys"}|{type:"door"}|{type:"result"}|null;
export function L2Game(){
 const [state,setState]=useState(initialState);const stateRef=useRef(state);
 const [prompt,setPrompt]=useState<Prompt>(null);const [ready,setReady]=useState(false);
 const [loadError,setLoadError]=useState(false);const [attempt,setAttempt]=useState(0);
 const [storageReady,setStorageReady]=useState(false);const [storageError,setStorageError]=useState("");
 const searchConflict=useRef(false);
 const [conflict,setConflict]=useState(false);const [portrait,setPortrait]=useState(false);
 const [modal,setModal]=useState<"menu"|"reset"|"trace"|null>(null);
 const [message,setMessage]=useState("走近桌边，或找个位置坐一会儿。");
 const dialog=useRef<HTMLDialogElement>(null);const rotation=useRef<HTMLDialogElement>(null);const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  try{const raw=localStorage.getItem(SAVE_KEY);if(raw){const saved=restore(raw);stateRef.current=saved;setState(saved);setMessage("已恢复这间房间的探索进度。");}}catch{setStorageError("本机存档无法读取。可以从菜单重新开始。");}
  setStorageReady(true);
  const change=(e:StorageEvent)=>{if(e.key===SAVE_KEY||e.key===null){searchConflict.current=true;setConflict(true);}};window.addEventListener("storage",change);
  const query=matchMedia("(pointer: coarse) and (orientation: portrait) and (max-width: 900px)");const update=()=>setPortrait(query.matches);update();query.addEventListener("change",update);
  return()=>{window.removeEventListener("storage",change);query.removeEventListener("change",update);};
 },[]);
 useEffect(()=>{let active=true;setReady(false);setLoadError(false);Promise.all(assets.map(name=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=reject;img.src=`/game/l2/${name}`;}))).then(()=>{if(active)setReady(true);}).catch(()=>{if(active)setLoadError(true);});return()=>{active=false;};},[attempt]);
 useEffect(()=>{if(modal)dialog.current?.showModal();else dialog.current?.close();},[modal]);
 useEffect(()=>{if(portrait)rotation.current?.showModal();else rotation.current?.close();},[portrait]);
 useEffect(()=>{if(prompt)heading.current?.focus({preventScroll:true});},[prompt]);
 const flushSearch=useRef<()=>void>(()=>{});
 const blocked=!ready||!storageReady||portrait||!!modal||conflict||!!storageError;
 useEffect(()=>{
  if(state.search.status!=="searching"||state.view!=="bedroom"||blocked||prompt)return;
  const clock=new SearchClock();const base=stateRef.current.search.activeMs;
  const flush=()=>{if(searchConflict.current)return;const current=stateRef.current;if(current.search.status!=="searching")return;const activeMs=base+clock.read();const next=transition(current,{id:crypto.randomUUID(),at:new Date().toISOString(),action:{type:"search-time",activeMs}});if(next!==current)persist(next);};
  flushSearch.current=flush;
  const update=()=>{if(document.visibilityState!=="visible"||!navigator.onLine){clock.pause();flush();}else clock.resume();};
  const leave=()=>{clock.pause();flush();};update();
  const timer=setInterval(()=>{const current=stateRef.current.search;const elapsed=base+clock.read();if(elapsed-current.activeMs>=5000||(!current.long&&elapsed>15000))flush();},250);
  document.addEventListener("visibilitychange",update);window.addEventListener("online",update);window.addEventListener("offline",update);window.addEventListener("pagehide",leave);
  return()=>{clearInterval(timer);clock.pause();flush();flushSearch.current=()=>{};document.removeEventListener("visibilitychange",update);window.removeEventListener("online",update);window.removeEventListener("offline",update);window.removeEventListener("pagehide",leave);};
 },[state.search.status,state.view,blocked,prompt]);
 function persist(next:State){try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,events:next.events}));stateRef.current=next;setState(next);return true;}catch{setStorageError("保存失败，请检查浏览器存储权限。当前操作未保存。");return false;}}
 function act(action:Action){if(blocked)return false;const before=stateRef.current;const next=transition(before,{id:crypto.randomUUID(),at:new Date().toISOString(),action});if(next===before)return true;return persist(next);}
 function table(){if(blocked)return;if(act({type:"arrive-table"})){setPrompt({type:"keys"});setMessage("你来到了桌边。");}}
 function sit(seat:Seat,yes:boolean){if(!act({type:"sit",seat,yes}))return;if(yes){setPrompt(seat==="table-seat"?{type:"keys"}:null);setMessage(`你在${seatNames[seat]}坐下了。`);}else{setPrompt(null);setMessage("先不坐下，继续看看房间。");}}
 function pick(key:KeyId){if(!act({type:"select-key",key}))return;setPrompt(null);setMessage(`已收好${keyNames[key]}。可以去门边试试，也可以再拿另一把。`);}
 function reset(){if(conflict)return;if(persist(initialState())){setStorageError("");setPrompt(null);setModal(null);setMessage("走近桌边，或找个位置坐一会儿。");}}
 function changeView(view:"room"|"table"){if(stateRef.current.view!==view&&!act({type:"view",view}))return;setPrompt(null);}
 function door(){if(blocked)return;changeView("room");setPrompt({type:stateRef.current.doorOpen?"result":"door"});}
 function tryDoor(key:KeyId){if(blocked||stateRef.current.doorOpen||stateRef.current.attempts.includes(key)||!stateRef.current.keys.includes(key))return;if(act({type:"try-door",key}))setPrompt({type:"result"});}
 function explore(yes:boolean){if(blocked||!stateRef.current.doorOpen||stateRef.current.view!=="room")return;if(act({type:"explore",yes})){setPrompt(null);setMessage(yes?"你走进了房间。":"先留在大厅，门仍然半开着。");}}
 function searchChoice(yes:boolean){if(act({type:"search-choice",yes})){setPrompt(null);setMessage(yes?"仔细看看房间，寻找那只耳环。":"先看看房间的其他地方。");}}
 function findEarring(){if(blocked||stateRef.current.search.status!=="searching")return;flushSearch.current();if(act({type:"curtain-click"})){if(stateRef.current.search.curtainClicks===3){setPrompt({type:"found"});setMessage("你在窗帘附近找到了另一只耳环。");}else setMessage("你拨开窗帘，继续仔细查看。");}}
 function requestReturn(){if(blocked)return;if(stateRef.current.search.status!=="found")setPrompt({type:"return"});else returnHall();}
 function returnHall(){if(blocked||stateRef.current.view!=="bedroom")return;if(act({type:"return-hall"})){setPrompt(null);setMessage("你回到了大厅。");}}
 function startLayout(){if(act({type:"layout-start"})){setPrompt(null);setMessage("拖动家具，按你觉得合适的方式摆放。");}}
 function moveFurniture(id:FurnitureId,point:Point){if(blocked||prompt||!stateRef.current.furniture.editing)return;if(!moveLayout(stateRef.current.furniture.layout,id,point)){setMessage("这里放不稳，试着放到地面空处。");return;}if(act({type:"layout-move",id,point}))setMessage(`${furniture[id].name}的位置已保留，可以继续调整。`);}
 function layoutAction(type:"layout-undo"|"layout-reset"|"layout-exit"|"layout-confirm"){if(act({type})){setPrompt(null);setMessage(type==="layout-confirm"?"摆放已保存。":type==="layout-undo"?"已撤销上一次移动。":type==="layout-reset"?"已恢复初始摆放。":"当前摆放已保留。");}}
 const anchor=prompt?.type==="seat"?prompt.seat:prompt?.type==="found"?"armchair":"keys";
 return <main className={styles.game}>
  <section className={styles.stage} aria-label="第二幕游戏舞台">
   <Scene state={state} disabled={blocked||(state.furniture.editing&&!!prompt)} onTable={table} onDoor={door} onKey={pick} onSearch={()=>{if(!blocked)setPrompt({type:"search"});}} onFind={findEarring} onMove={moveFurniture} onSeat={seat=>{if(!blocked)setPrompt({type:"seat",seat});}}/>
   {ready&&!state.furniture.editing&&<nav className={styles.navigation} aria-label="房间探索操作">
    {state.view==="bedroom"?<button disabled={blocked} onClick={requestReturn}>返回大厅</button>:state.view==="table"?<button disabled={blocked} onClick={()=>changeView("room")}>起身回大厅</button>:keysAvailable(state)&&state.keys.length<2&&<button disabled={blocked} onClick={()=>changeView("table")}>回到桌边拿钥匙</button>}
    {state.view!=="bedroom"&&state.keys.length>0&&<button disabled={blocked} onClick={door}>{state.doorOpen?"查看半开的门":"去开门试试"}</button>}
    {state.view==="bedroom"&&!["searching","found"].includes(state.search.status)&&<button disabled={blocked} onClick={()=>setPrompt({type:"search"})}>查看梳妆台</button>}
    {state.view==="room"&&<button disabled={blocked} onClick={startLayout}>整理家具</button>}
   </nav>}
   {ready&&state.furniture.editing&&<nav className={styles.layoutTools} aria-label="家具摆放操作">
    <LayoutButton disabled={blocked||!!prompt} onAction={()=>setPrompt({type:"layout-confirm"})}>确认摆放</LayoutButton>
    <LayoutButton disabled={blocked||!!prompt||!state.furniture.history.length} onAction={()=>layoutAction("layout-undo")}>撤销移动</LayoutButton>
    <LayoutButton disabled={blocked||!!prompt} onAction={()=>setPrompt({type:"layout-reset"})}>恢复初始摆放</LayoutButton>
    <LayoutButton disabled={blocked||!!prompt} onAction={()=>layoutAction("layout-exit")}>返回探索</LayoutButton>
   </nav>}
   <header className={styles.heading}><h1>失联房间</h1></header>
   <button className={styles.menu} aria-label="打开第二幕菜单" onClick={()=>setModal("menu")}>☰</button>
   {(!ready||!storageReady)&&<div className={styles.loading} role="status"><p>{loadError?"房间素材加载失败，请重试。":"正在准备房间…"}</p>{loadError&&<button onClick={()=>setAttempt(v=>v+1)}>重新加载</button>}</div>}
   {prompt&&<section className={`${styles.bubble} ${styles[anchor]}`} aria-label="场景提示" inert={blocked}>
    <div className={styles.bubbleTitle}><h2 ref={heading} tabIndex={-1}>{prompt.type==="layout-confirm"?"就这样摆放吗？":prompt.type==="layout-reset"?"恢复家具的初始位置吗？":prompt.type==="search"?"桌上有一只耳环，要找找另一只吗？":prompt.type==="return"?"先回大厅吗？":prompt.type==="found"?"在窗帘附近找到另一只耳环了。":prompt.type==="seat"?"要在这里坐一会儿吗？":prompt.type==="door"?"用哪把钥匙试着开门？":prompt.type==="result"?(state.doorOpen?"里面很黑，要进去探索吗？":"这把钥匙没有打开门。" ):"桌上有两把钥匙，你想先选哪一把？"}</h2><button aria-label="关闭提示，继续探索" onClick={()=>setPrompt(null)}>×</button></div>
    {prompt.type==="layout-confirm"||prompt.type==="layout-reset"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>否，继续调整</button><button className={styles.primary} onClick={()=>layoutAction(prompt.type==="layout-confirm"?"layout-confirm":"layout-reset")}>{prompt.type==="layout-confirm"?"是，保存摆放":"是，恢复初始"}</button></div>:prompt.type==="search"?<div className={styles.actions}><button onClick={()=>searchChoice(false)}>否</button><button className={styles.primary} onClick={()=>searchChoice(true)}>是，开始寻找</button></div>:prompt.type==="return"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>继续留在房间</button><button onClick={returnHall}>是，返回大厅</button></div>:prompt.type==="found"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>继续看看</button><button onClick={returnHall}>返回大厅</button></div>:prompt.type==="seat"?<><div className={styles.actions}><button onClick={()=>sit(prompt.seat,false)}>否</button><button className={styles.primary} onClick={()=>sit(prompt.seat,true)}>是，坐下</button></div></>:prompt.type==="door"?<><p>{state.keys.length?"选择一把随身的钥匙试试。":"还没有钥匙，可以先去桌边看看。"}</p><div className={styles.keyChoices}>{state.keys.map(key=><button key={key} disabled={state.attempts.includes(key)} onClick={()=>tryDoor(key)} aria-label={`用${keyNames[key]}开门`}><KeySprite id={key}/><span>{keyNames[key]}</span>{state.attempts.includes(key)&&<small>已试过，无法打开</small>}</button>)}</div>{state.keys.length<2&&<button onClick={()=>changeView("table")} disabled={!keysAvailable(state)}>回到桌边拿钥匙</button>}</>:prompt.type==="result"&&state.doorOpen?<div className={styles.actions}><button onClick={()=>explore(false)}>否</button><button className={styles.primary} onClick={()=>explore(true)}>是，进去探索</button></div>:prompt.type==="result"?<><p>{state.doorOpen?"换一把钥匙后，门锁顺利打开了。":"可以换另一把钥匙再试试。"}</p><div className={styles.actions}>{!state.doorOpen&&<>{state.keys.length<2&&<button onClick={()=>changeView("table")}>回到桌边拿钥匙</button>}{state.keys.some(k=>!state.attempts.includes(k))&&<button onClick={()=>setPrompt({type:"door"})}>换另一把试试</button>}</>}<button onClick={()=>setPrompt(null)}>继续探索</button></div></>:<><p>可以拿一把，也可以把两把都收好。</p><div className={styles.keyChoices}>{(["key-1","key-2"] as KeyId[]).map(key=><button key={key} aria-label={`选择${keyNames[key]}`} aria-pressed={state.selectedKey===key} onClick={()=>pick(key)}><KeySprite id={key}/><span>{keyNames[key]}</span>{state.keys.includes(key)&&<small>已收好</small>}</button>)}</div></>}
   </section>}
   {state.view!=="bedroom"&&!state.furniture.editing&&<aside className={styles.inventory} aria-label="钥匙物品栏">{(["key-1","key-2"] as KeyId[]).map(key=>state.keys.includes(key)?<button key={key} disabled={blocked} aria-label={`物品栏：${keyNames[key]}`} aria-pressed={state.selectedKey===key} onClick={()=>{if(keysAvailable(stateRef.current)){setPrompt({type:"keys"});}}}><KeySprite id={key}/><span>{keyNames[key]}</span></button>:<div className={styles.empty} key={key} aria-label={`${keyNames[key]}物品格为空`}/>)}</aside>}
   {!prompt&&ready&&<p className={styles.status} role="status">{message}</p>}
  </section>
  {(conflict||storageError)&&<section className={styles.notice} role="alert"><p>{conflict?"另一标签页更新了进度，请重新载入。":storageError}</p>{conflict?<button onClick={()=>location.reload()}>载入最新进度</button>:<button onClick={()=>setModal("reset")}>重新开始</button>}</section>}
  <dialog ref={dialog} className={styles.dialog} onCancel={()=>setModal(null)}><button className={styles.close} aria-label="关闭菜单" onClick={()=>setModal(null)}>×</button>
   {modal==="menu"&&<><h2>房间里的探索</h2><p>点击桌边，或在桌前椅坐下，就会出现钥匙选择。窗边椅可以坐下休息，两个沙发仅供观赏。只有明确选择后，钥匙才会进入物品栏。</p><p>当前为 L2 四组前端预览，进度保存在此浏览器。已支持半开门进入卧室和返回大厅；已支持耳环搜寻；支持家具组合拖动与摆放保存；服务器同步尚未接入。</p><div className={styles.actions}><button onClick={()=>setModal("trace")}>查看本机选择</button><button onClick={()=>setModal("reset")} disabled={conflict}>重新开始</button><Link href="/">返回第一幕</Link></div></>}
   {modal==="reset"&&<><h2>重新探索这个房间？</h2><p>将清除本机的 L2 座位和钥匙选择，L1 服务器进度不受影响。</p><div className={styles.actions}><button onClick={()=>setModal(null)}>保留当前进度</button><button onClick={reset} disabled={conflict}>确认重新开始</button></div></>}
   {modal==="trace"&&<><h2>本机选择记录</h2><p>这些记录尚未提交服务器，不代表正式评分。</p><p>家具事件：合理整理{state.furniture.triggered.tidy?"已触发":"未触发"}；放在空旷处{state.furniture.triggered.openPlacement?"已触发":"未触发"}。</p>{state.furniture.classification&&<p>最近确认规则：{state.furniture.classification.ruleVersion}；本次新触发：{state.furniture.classification.events.map(e=>e==="tidy"?"合理整理":"放在空旷处").join("、")||"无"}。</p>}<ol>{state.events.map(e=><li key={e.id}>{e.action.type==="layout-move"?`移动${furniture[e.action.id].name}`:e.action.type==="layout-start"?"开始整理家具":e.action.type==="layout-undo"?"撤销家具移动":e.action.type==="layout-reset"?"恢复初始家具位置":e.action.type==="layout-exit"?"保留摆放并返回探索":e.action.type==="layout-confirm"?"确认家具摆放":e.action.type==="search-choice"?(e.action.yes?"开始寻找耳环":"暂不寻找耳环"):e.action.type==="search-time"?`寻找有效时间：${e.action.activeMs}ms${e.action.activeMs>15000?"（长寻找）":""}`:e.action.type==="curtain-click"?"查看窗帘附近":e.action.type==="find-earring"?"找到耳环（旧版记录）":e.action.type==="explore"?(e.action.yes?"进入卧室探索":"暂不进入卧室"):e.action.type==="return-hall"?"从卧室返回大厅":e.action.type==="view"?(e.action.view==="table"?"查看桌面":"回到大厅"):e.action.type==="try-door"?`用${keyNames[e.action.key]}开门：${state.attempts[0]===e.action.key?"第一次失败":"第二次成功"}`:e.action.type==="arrive-table"?"走到桌边":e.action.type==="sit"?`${seatNames[e.action.seat]}：${e.action.yes?"坐下":"不坐"}`:`选择${keyNames[e.action.key]}`}</li>)}</ol>{!state.events.length&&<p>尚未作出选择。</p>}</>}
  </dialog>
  <dialog ref={rotation} className={styles.dialog} onCancel={e=>e.preventDefault()}><h2>换一个方向，继续旅程</h2><p>为了保证用户体验请翻转手机为横屏</p></dialog>
 </main>;
}
