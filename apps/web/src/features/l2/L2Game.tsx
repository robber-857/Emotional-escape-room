"use client";
import {furniture,moveLayout,type FurnitureId,type Point} from "./layout";
import {useEffect,useRef,useState} from "react";
import {useSceneAssets} from "../shared/useSceneAssets";
import {measureLayout} from "./metrics";
import {LayoutButton} from "./LayoutButton";
import {SearchClock} from "./searchClock";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ActOpening} from "../shared/ActOpening";
import {LevelHeading} from "../shared/LevelHeading";
import {Scene,KeySprite,assets} from "./Scene";
import {initialState,transition,restore,keysAvailable,seatNames,keyNames,SAVE_KEY,MAX_EVENTS,type Seat,type State,type Action,type KeyId} from "./model";
import styles from "./l2.module.css";
import * as api from "./api";
import {SESSION_KEY} from "../l1/api";
import {playerMessage} from "../shared/playerMessage";
type Prompt = {type:"use-key";key:KeyId}|{type:"layout-confirm"}|{type:"layout-reset"}| {type:"search"}|{type:"return"}|{type:"found"}| {type:"seat";seat:Seat}|{type:"keys"}|{type:"door"}|{type:"result"}|null;
export function L2Game({preview=false}:{preview?:boolean}){
 const router=useRouter();
 function enterThird(){if(!blocked&&stateRef.current.exitDoorOpen)router.push(preview?"/l3?preview=1&from=l2":"/l3?from=l2");}
  const [entered,setEntered]=useState(false);
 const [earringDropping,setEarringDropping]=useState(false);
 const [state,setState]=useState(initialState);const stateRef=useRef(state);
 const [prompt,setPrompt]=useState<Prompt>(null);
 const [attempt,setAttempt]=useState(0);
 const sceneAssets=state.view==="bedroom"?["bedroom-single-clue.png","earring-green.png","keys.png"]:state.view==="table"?["table-view.png","keys.png"]:assets.filter(name=>!["bedroom-single-clue.png","earring-green.png","table-view.png"].includes(name));
 const {ready,error:loadError}=useSceneAssets(sceneAssets.map(name=>`/game/l2/${name}`),attempt);
 const [storageReady,setStorageReady]=useState(false);const [storageError,setStorageError]=useState("");
 const searchConflict=useRef(false);
 const server=useRef<api.Session|null>(null);const requestLock=useRef(false);
 const [syncing,setSyncing]=useState(false);const [syncError,setSyncError]=useState("");
 const [conflict,setConflict]=useState(false);const [portrait,setPortrait]=useState(false);
 const [modal,setModal]=useState<"menu"|"reset"|null>(null);
 const [message,setMessage]=useState("走近桌边，或找个位置坐一会儿。");
 const dialog=useRef<HTMLDialogElement>(null);const rotation=useRef<HTMLDialogElement>(null);const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  if(preview){try{const raw=localStorage.getItem(SAVE_KEY);if(raw){const saved=restore(raw);stateRef.current=saved;setState(saved);setMessage("已恢复这间房间的探索进度。");}}catch{setStorageError("本机存档无法读取。可以从菜单重新开始。");}setStorageReady(true);}
  else void syncServer();
  const change=(e:StorageEvent)=>{if(e.key===null||(preview?e.key===SAVE_KEY:e.key===SESSION_KEY||(server.current&&e.key===api.changeKey(server.current.id)))){searchConflict.current=true;setConflict(true);}};window.addEventListener("storage",change);
  const query=matchMedia("(pointer: coarse) and (orientation: portrait) and (max-width: 900px)");const update=()=>setPortrait(query.matches);update();query.addEventListener("change",update);
  return()=>{window.removeEventListener("storage",change);query.removeEventListener("change",update);};
 },[preview]);
 useEffect(()=>{if(modal)dialog.current?.showModal();else dialog.current?.close();},[modal]);
 useEffect(()=>{if(portrait)rotation.current?.showModal();else rotation.current?.close();},[portrait]);
 useEffect(()=>{if(prompt)heading.current?.focus({preventScroll:true});},[prompt]);
 const flushSearch=useRef<()=>Promise<boolean>>(async()=>true);
 const visitedBedroom=state.events.some(event=>event.action.type==="explore"&&event.action.yes);
 const saveFull=state.events.length>=MAX_EVENTS;
 const blocked=!entered||!ready||!storageReady||portrait||!!modal||conflict||!!storageError||saveFull||syncing||!!syncError;
 useEffect(()=>{
  if(state.search.status!=="searching"||state.view!=="bedroom"||blocked||prompt)return;
  const clock=new SearchClock();const base=stateRef.current.search.activeMs;
  const flush=async()=>{if(searchConflict.current||requestLock.current)return false;const current=stateRef.current;if(current.search.status!=="searching")return true;const activeMs=preview?base+clock.read():Math.min(base+clock.read(),current.search.activeMs+10000);if(activeMs<=current.search.activeMs)return true;if(!preview)return act({type:"search-time",activeMs},true);const next=transition(current,{id:crypto.randomUUID(),at:new Date().toISOString(),action:{type:"search-time",activeMs}});return next===current||persist(next);};
  flushSearch.current=flush;
  const update=()=>{if(document.visibilityState!=="visible"||!navigator.onLine){clock.pause();flush();}else clock.resume();};
  const leave=()=>{clock.pause();flush();};update();
  const timer=setInterval(()=>{const current=stateRef.current.search;const elapsed=base+clock.read();if(elapsed-current.activeMs>=5000||(!current.long&&elapsed>15000))flush();},250);
  document.addEventListener("visibilitychange",update);window.addEventListener("online",update);window.addEventListener("offline",update);window.addEventListener("pagehide",leave);
  return()=>{clearInterval(timer);clock.pause();void flush();flushSearch.current=async()=>true;document.removeEventListener("visibilitychange",update);window.removeEventListener("online",update);window.removeEventListener("offline",update);window.removeEventListener("pagehide",leave);};
 },[state.search.status,state.view,blocked,prompt]);
 function persist(next:State){try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,events:next.events}));stateRef.current=next;setState(next);return true;}catch{setStorageError("保存失败，请检查浏览器存储权限。当前操作未保存。");return false;}}
 function applyServer(current:api.Session){server.current=current;stateRef.current=current.state;setState(current.state);}
 async function syncServer(){
  if(requestLock.current)return;requestLock.current=true;setSyncing(true);setSyncError("");
  try{const auth=api.credentials();let current=await api.start(auth);const pending=api.readPending(auth.id);if(pending)current=await api.submit(auth,pending);applyServer(current);setStorageReady(true);setPrompt(null);setMessage("");}
  catch(error){if(error instanceof api.RejectedAction){applyServer(error.session);setStorageReady(true);}setSyncError(error instanceof Error?error.message:"无法连接服务器，请重试。");}
  finally{requestLock.current=false;setSyncing(false);}
 }
 async function act(action:Action,clockFlush=false){
  if((blocked&&!clockFlush)||searchConflict.current||requestLock.current||stateRef.current.events.length>=MAX_EVENTS)return false;
  const before=stateRef.current;
  if(preview){const next=transition(before,{id:crypto.randomUUID(),at:new Date().toISOString(),action});return next===before||persist(next);}
  if((action.type==="arrive-table"&&before.atTable)||(action.type==="select-key"&&before.selectedKey===action.key))return true;
  if(!server.current||syncError)return false;
  requestLock.current=true;setSyncing(true);
  try{const auth=api.credentials();if(auth.id!==server.current.id)throw new Error("旅程已切换，请重新载入。");const pending=api.prepare(server.current,action);applyServer(await api.submit(auth,pending));return true;}
  catch(error){if(error instanceof api.RejectedAction){applyServer(error.session);if(error.code==="L2_FINALIZED"){setPrompt(null);setMessage("你已经走进第三幕，这间房间的选择已成为过去。");return false;}if(error.code==="LAYOUT_OUTSIDE_FLOOR"){const outside=measureLayout(error.session.state.furniture.layout,error.session.state.furniture.adjustmentCount).evidence.outsideFloor;setPrompt(null);setMessage(`${outside.map(id=>furniture[id].name).join("、")}超出地面范围，请移回地面后再次确认。`);return false;}if(error.code==="INVALID_PLACEMENT"||error.code==="NO_CHANGE"){setPrompt(null);setMessage(error.code==="INVALID_PLACEMENT"?"这件家具暂时无法移动，请重试。":"位置没有变化，继续探索即可。");return false;}setPrompt(null);}setSyncError(error instanceof Error?error.message:"同步失败，请重试。");return false;}
  finally{requestLock.current=false;setSyncing(false);}
 }
 async function table(){if(blocked)return;if(await act({type:"arrive-table"})){setPrompt({type:"keys"});setMessage("已到桌边。");}}
 async function returnToKeys(){
  if(blocked)return;
  if(!keysAvailable(stateRef.current)&&!await act({type:"arrive-table"}))return;
  if(!await changeView("table"))return;
  setPrompt({type:"keys"});
 }
 async function sit(seat:Seat,yes:boolean){if(!await act({type:"sit",seat,yes}))return;if(yes){setPrompt(seat==="table-seat"?{type:"keys"}:null);setMessage(`你在${seatNames[seat]}坐下了。`);}else{setPrompt(null);setMessage("先不坐下，继续看看房间。");}}
 async function pick(key:KeyId){if(!await act({type:"select-key",key}))return;setPrompt(null);setMessage("");}
 async function reset(){
  if(conflict||requestLock.current)return;
  if(preview){if(persist(initialState())){setStorageError("");setPrompt(null);setModal(null);setMessage("走近桌边，或找个位置坐一会儿。");}return;}
  if(!server.current)return;
  requestLock.current=true;setSyncing(true);setSyncError("");
  try{await api.restart(server.current);window.location.assign("/l2");}
  catch(error){setModal(null);setSyncError(playerMessage(error instanceof Error?error.message:"","暂时无法重新探索，请重试。"));}
  finally{requestLock.current=false;setSyncing(false);}
 }
 async function changeView(view:"room"|"table"){if(stateRef.current.view!==view&&!await act({type:"view",view}))return false;setPrompt(null);return true;}
 async function door(){if(blocked)return;if(await changeView("room"))setPrompt({type:stateRef.current.doorOpen?"result":"door"});}
 async function tryDoor(key:KeyId){if(blocked||stateRef.current.doorOpen||stateRef.current.attempts.includes(key)||!stateRef.current.keys.includes(key))return;if(await act({type:"try-door",key}))setPrompt({type:"result"});}
 async function explore(yes:boolean){if(blocked||!stateRef.current.doorOpen||stateRef.current.view!=="room")return;if(await act({type:"explore",yes})){setPrompt(null);setMessage(yes?"你走进了房间。":"已留在大厅。");}}
 async function searchChoice(yes:boolean){if(await act({type:"search-choice",yes})){setPrompt(null);setMessage(yes?"仔细看看房间，寻找那只耳环。":"已暂停寻找。");}}
 async function findEarring(){if(blocked||stateRef.current.search.status!=="searching")return;if(!await flushSearch.current())return;if(await act({type:"curtain-click"})){if(stateRef.current.search.curtainClicks===3){setEarringDropping(true);setPrompt({type:"found"});setMessage("你在窗帘附近找到了另一只耳环。");}else setMessage("你拨开窗帘，继续仔细查看。");}}
 async function requestReturn(){if(blocked)return;if(!await flushSearch.current())return;if(stateRef.current.search.status!=="found")setPrompt({type:"return"});else returnHall();}
 async function returnHall(){if(blocked||stateRef.current.view!=="bedroom")return;if(await act({type:"return-hall"})){setEarringDropping(false);setPrompt(null);setMessage("已回到大厅。");}}
 async function startLayout(){if(await act({type:"layout-start"})){setPrompt(null);setMessage("拖动家具，按你觉得合适的方式摆放。");}}
 async function moveFurniture(id:FurnitureId,point:Point){if(blocked||prompt||!stateRef.current.furniture.editing)return;if(!moveLayout(stateRef.current.furniture.layout,id,point)){setMessage("这件家具暂时无法移动，请重试。");return;}const bounded=moveLayout(stateRef.current.furniture.layout,id,point)![id];if(Math.hypot(bounded.u-stateRef.current.furniture.layout[id].u,bounded.v-stateRef.current.furniture.layout[id].v)<.002){setMessage("已到可摆放边缘，可以沿墙继续调整。");return;}if(await act({type:"layout-move",id,point:bounded}))setMessage(`${furniture[id].name}移到了新的位置。`);}
 async function layoutAction(type:"layout-reset"|"layout-exit"|"layout-confirm"){if(await act({type})){setPrompt(null);setMessage(type==="layout-confirm"?(stateRef.current.exitDoorOpen?"房间整理好了，可以继续前往下一幕。":"房间整理好了，再看看其他物品吧。"):type==="layout-reset"?"已恢复初始摆放。":"继续看看这个房间吧。");}}
 const anchor=prompt?.type==="use-key"||prompt?.type==="door"||prompt?.type==="result"?"doorPrompt":prompt?.type==="seat"?prompt.seat:prompt?.type==="found"?"armchair":"keys";
 return <main className={styles.game}>
  {!entered&&<ActOpening journeyId={preview?"preview-l2":server.current?.id} resume={state.events.length>0} act="第二幕" title="失联房间" prompt="请自由探索房间。" ready={ready&&storageReady&&!portrait&&!modal&&!syncError&&!storageError&&!conflict} onEnter={()=>setEntered(true)}/>}
    <section className={styles.stage} aria-label="第二幕游戏舞台">
   <Scene state={state} earringDropping={earringDropping} onEarringLanded={()=>setEarringDropping(false)} disabled={blocked||(state.furniture.editing&&!!prompt)} onTable={table} onExit={enterThird} onDoor={door} onKey={pick} onSearch={()=>{if(!blocked)setPrompt({type:"search"});}} onFind={findEarring} onMove={moveFurniture} onSeat={seat=>{if(!blocked)setPrompt({type:"seat",seat});}}/>
   {ready&&!state.furniture.editing&&<nav className={styles.navigation} aria-label="房间探索操作">
    {state.view==="bedroom"?<button disabled={blocked} onClick={requestReturn}>{state.search.status==="searching"?"放弃寻找并返回大厅":"返回大厅"}</button>:state.view==="table"?(state.keys.length===0||visitedBedroom)&&<button disabled={blocked} onClick={()=>changeView("room")}>起身回大厅</button>:keysAvailable(state)&&state.keys.length<2&&<button disabled={blocked} onClick={returnToKeys}>回到桌边拿钥匙</button>}
    {state.view!=="bedroom"&&!visitedBedroom&&state.keys.length>0&&<button disabled={blocked} onClick={door}>{state.doorOpen?"查看半开的门":"去开门试试"}</button>}
    {state.view==="bedroom"&&!["searching","found"].includes(state.search.status)&&<button disabled={blocked} onClick={()=>setPrompt({type:"search"})}>查看梳妆台上的耳环</button>}
    {state.view==="room"&&!state.furniture.confirmed&&<button disabled={blocked} onClick={startLayout}>整理家具</button>}
    {state.view==="room"&&state.exitDoorOpen&&<button className="gameYes" disabled={blocked} onClick={enterThird}>进入第三幕</button>}
   </nav>}
   {ready&&state.furniture.editing&&<nav className={styles.layoutTools} aria-label="家具摆放操作">
    <LayoutButton disabled={blocked||!!prompt} onAction={()=>setPrompt({type:"layout-confirm"})}>确认摆放</LayoutButton>
    <LayoutButton disabled={blocked||!!prompt} onAction={()=>setPrompt({type:"layout-reset"})}>恢复初始摆放</LayoutButton>
    <LayoutButton disabled={blocked||!!prompt} onAction={()=>layoutAction("layout-exit")}>返回探索</LayoutButton>
   </nav>}
   <LevelHeading className={styles.heading} ready={entered&&ready&&storageReady&&!portrait}><h1>失联房间</h1></LevelHeading>
   <button className={styles.menu} aria-label="打开第二幕菜单" onClick={()=>setModal("menu")}>☰</button>
   {(!ready||(!storageReady&&!syncError))&&<div className={styles.loading} role="status"><p>{loadError?"房间素材加载失败，请重试。":"正在准备房间…"}</p>{loadError&&<button onClick={()=>setAttempt(v=>v+1)}>重新加载</button>}</div>}
   {prompt&&<section className={`${styles.bubble} ${styles[anchor]}`} data-game-prompt aria-label="场景提示" inert={blocked}>
    <div className={styles.bubbleTitle}><h2 ref={heading} tabIndex={-1}>{prompt.type==="use-key"?"去开门试试？":prompt.type==="keys"&&state.keys.length===2?"你已经拿完了所有的钥匙。":prompt.type==="layout-confirm"?"就这样摆放吗？":prompt.type==="layout-reset"?"恢复家具的初始位置吗？":prompt.type==="search"?"要寻找另一只耳环吗？":prompt.type==="return"?"先回大厅吗？":prompt.type==="found"?"找到另一只耳环了":prompt.type==="seat"?"要在这里坐下吗？":prompt.type==="door"?"要用哪把钥匙开门？":prompt.type==="result"?(state.doorOpen?"要进入房间吗？":"这把钥匙没有打开门。" ):"要拿哪把钥匙？"}</h2><button aria-label="关闭提示，继续探索" onClick={()=>setPrompt(null)}>×</button></div>
    {prompt.type==="use-key"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>否</button><button className={`${styles.primary} gameYes`} onClick={()=>tryDoor(prompt.key)}>是</button></div>:prompt.type==="layout-confirm"||prompt.type==="layout-reset"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>否</button><button className={`${styles.primary} gameYes`} onClick={()=>layoutAction(prompt.type==="layout-confirm"?"layout-confirm":"layout-reset")}>是</button></div>:prompt.type==="search"?<div className={styles.actions}><button onClick={()=>searchChoice(false)}>否</button><button className={`${styles.primary} gameYes`} onClick={()=>searchChoice(true)}>是</button></div>:prompt.type==="return"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>否</button><button className="gameYes" onClick={returnHall}>是</button></div>:prompt.type==="found"?<div className={styles.actions}><button onClick={()=>setPrompt(null)}>继续看看</button><button className="gameYes" onClick={returnHall}>返回大厅</button></div>:prompt.type==="seat"?<><div className={styles.actions}><button onClick={()=>sit(prompt.seat,false)}>否</button><button className={`${styles.primary} gameYes`} onClick={()=>sit(prompt.seat,true)}>是</button></div></>:prompt.type==="door"?<><p>{state.keys.length?"选择随身的钥匙。":"尚未携带钥匙。"}</p><div className={styles.keyChoices}>{state.keys.filter(key=>!state.attempts.includes(key)).map(key=><button key={key} disabled={state.attempts.includes(key)} onClick={()=>tryDoor(key)} aria-label={`用${keyNames[key]}开门`}><KeySprite id={key}/><span>{keyNames[key]}</span>{state.attempts.includes(key)&&<small>已试过，无法打开</small>}</button>)}</div>{state.keys.length<2&&<button onClick={returnToKeys} disabled={blocked}>回到桌边拿钥匙</button>}</>:prompt.type==="result"&&state.doorOpen?<div className={styles.actions}><button onClick={()=>explore(false)}>否</button><button className={`${styles.primary} gameYes`} onClick={()=>explore(true)}>是</button></div>:prompt.type==="result"?<><p>{state.doorOpen?"门已打开。":"门仍然关着。"}</p><div className={styles.actions}>{!state.doorOpen&&<>{state.keys.length<2&&<button onClick={returnToKeys}>回到桌边拿钥匙</button>}{state.keys.some(k=>!state.attempts.includes(k))&&<button onClick={()=>setPrompt({type:"door"})}>换另一把试试</button>}</>}<button onClick={()=>setPrompt(null)}>继续探索</button></div></>:<><div className={styles.keyChoices}>{(["key-1","key-2"] as KeyId[]).filter(key=>!state.keys.includes(key)).map(key=><button key={key} aria-label={`选择${keyNames[key]}`} aria-pressed={state.selectedKey===key} onClick={()=>pick(key)}><KeySprite id={key}/><span>{keyNames[key]}</span></button>)}</div></>}
   </section>}
   {state.view!=="bedroom"&&!state.furniture.editing&&<aside className={styles.inventory} aria-label="钥匙物品栏">{(["key-1","key-2"] as KeyId[]).map(key=>state.keys.includes(key)&&!state.attempts.includes(key)?<button key={key} disabled={blocked} aria-label={`物品栏：${keyNames[key]}`} aria-pressed={state.selectedKey===key} onClick={async()=>{if(await changeView("room"))setPrompt({type:"use-key",key});}}><KeySprite id={key}/><span>{keyNames[key]}</span></button>:<div className={styles.empty} key={key} aria-label={`${keyNames[key]}物品格为空`}/>)}</aside>}
   {!prompt&&ready&&(syncing||message)&&<p className={styles.status} role="status">{syncing?"请稍候…":message}</p>}
  </section>
  {(conflict||storageError||saveFull||syncError)&&<section className={styles.notice} role="alert"><p>{conflict?"另一标签页更新了进度，请重新载入。":playerMessage(syncError||storageError,"暂时无法继续这段探索，请重试，或返回第一幕重新开始。")}</p>{conflict?<button onClick={()=>location.reload()}>载入最新进度</button>:preview?<button onClick={()=>setModal("reset")}>重新开始</button>:<><button disabled={syncing||saveFull} onClick={syncServer}>重试</button><Link href="/">返回第一幕</Link></>}</section>}
  <dialog data-game-dialog ref={dialog} className={styles.dialog} onCancel={()=>setModal(null)}><button className={styles.close} aria-label="关闭菜单" onClick={()=>setModal(null)}>×</button>
   {modal==="menu"&&<><h2>房间里的探索</h2><p>点击桌边，或在桌前椅坐下，就会出现钥匙选择。窗边椅可以坐下休息，点击“整理家具”可以移动椅子和沙发，完成至少五项不同的计分动作后，就能继续前往第三幕。整理家具并确认也算一项，重复操作不重复累计。只有明确选择后，钥匙才会进入物品栏。</p><div className={styles.actions}><button onClick={()=>setModal(null)}>继续探索</button><button onClick={()=>setModal("reset")} disabled={conflict||syncing}>重新探索此关卡</button></div></>}
   {modal==="reset"&&<><h2>重新探索这个房间？</h2><p>将重新开始这个房间的探索，包括钥匙、耳环寻找和家具摆放。</p><div className={styles.actions}><button onClick={()=>setModal(null)}>保留当前进度</button><button onClick={reset} disabled={conflict||syncing}>确认重新开始</button></div></>}
  </dialog>
  <dialog data-game-dialog ref={rotation} className={styles.dialog} onCancel={e=>e.preventDefault()}><h2>换一个方向，继续旅程</h2><p>为了保证用户体验请翻转手机为横屏</p></dialog>
 </main>;
}
