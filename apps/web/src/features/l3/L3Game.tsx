"use client";
import {carrySlots} from "./CarryScene";
import {useEffect,useRef,useState} from "react";
import {useSceneAssets} from "../shared/useSceneAssets";
import {ActOpening} from "../shared/ActOpening";
import {LevelHeading} from "../shared/LevelHeading";
import {useRouter} from "next/navigation";
import {assets,Scene} from "./Scene";
import {SAVE_KEY,MAX_EVENTS,items,initialState,stormComplete,transition,isRepeatedDecision,serialize,restore,type State,type Segment,type Decision,type Item,type Action} from "./model";
import styles from "./l3.module.css";
import {useServerL3} from "./useServerL3";
import {playerMessage} from "../shared/playerMessage";

const questions:Record<Decision,string> = {
  open:"要完全打开门吗？",close:"要把门关上吗？",
  wait:"要坐稳等待吗？",curtain:"要拉开右窗的窗帘吗？",window:"要关闭左边的窗户吗？","right-window":"要关闭右边的窗户吗？",television:"要关掉电视机电源吗？",
};
type Prompt = Decision | "confirm" | null;
export function L3Game({segment:initialSegment,preview=true}:{segment:Segment;preview?:boolean}) {
  const [entered,setEntered]=useState(initialSegment==="carry");
  const router=useRouter();
  const key = `${SAVE_KEY}:${initialSegment}`;
  const server=useServerL3(!preview);
  const [localState,setState] = useState(()=>initialState(initialSegment));
  const state=preview?localState:server.state;
  const segment=state.segment;
  const current = useRef(state); const lastRaw = useRef<string|null>(null);
  const [localLoaded,setLoaded] = useState(false);
  const loaded=preview?localLoaded:server.loaded;
  const [attempt,setAttempt] = useState(0);
  const carryAssets=["scarf.png","lantern.png","umbrella.png","doll.png","key.png","journal.png","rope.png","backpack.png"];
  const sceneAssets=segment==="carry"?assets.filter(file=>file!=="waiting-sofa-front.png"):assets.filter(file=>!carryAssets.includes(file));
  if(state.item&&state.item!=="compass"&&!sceneAssets.includes(`${state.item}.png`))sceneAssets.push(`${state.item}.png`);
  const {ready,error:assetError}=useSceneAssets(sceneAssets.map(file=>`/game/l3/${file}`),attempt);
  const [storageError,setStorageError] = useState(""),[localConflict,setConflict] = useState(false);
  const conflict=preview?localConflict:server.conflict;
  const [prompt,setPrompt] = useState<Prompt>(null),[modal,setModal] = useState<"menu"|"reset"|"reset-all"|null>(null);
  const [preparationChoices,setPreparationChoices] = useState<State["choices"]|null>(null);
  const [continuePreparing,setContinuePreparing] = useState(false);
  const [portrait,setPortrait] = useState(false),[reduced,setReduced] = useState(false);
  const [message,setMessage] = useState("");
  const [showCarryToast,setShowCarryToast] = useState(false);
  useEffect(()=>{
    if((!state.item&&state.carry!==false)||!loaded||!ready||!entered){setShowCarryToast(false);return;}
    setShowCarryToast(true);
    const timer=setTimeout(()=>setShowCarryToast(false),2500);
    return()=>clearTimeout(timer);
  },[state.item,state.carry,loaded,ready,entered]);
  const dialog = useRef<HTMLDialogElement>(null),rotation = useRef<HTMLDialogElement>(null),heading = useRef<HTMLHeadingElement>(null);
  const full = state.events.length >= MAX_EVENTS;
  const blocked = !entered || !loaded || !ready || !!storageError || conflict || portrait || !!modal || full || (!preview&&(server.busy||!!server.error));
  function load() {
    if(!preview){void server.sync().then(ok=>{if(ok){setPrompt(null);setMessage("进度已恢复。");}});return;}
    try {
      const raw = localStorage.getItem(key); const saved = raw === null ? initialState(segment) : restore(raw,initialSegment);
      if(segment==="carry"){
        const stormRaw=localStorage.getItem(`${SAVE_KEY}:storm`);
        setPreparationChoices(stormRaw!==null?restore(stormRaw,"storm").choices:null);
      }
      current.current=saved;lastRaw.current=raw;setState(saved);setConflict(false);setStorageError("");setPrompt(null);
      if(raw!==null)setMessage("进度已恢复。");
    } catch {setStorageError("本地预览存档无法读取。原数据已保留，可重试或明确重新开始。");}
    setLoaded(true);
  }
  useEffect(()=>{
    if(preview)load();
    const changed=(e:StorageEvent)=>{if(e.key===key||e.key===null||(segment==="carry"&&e.key===`${SAVE_KEY}:storm`)){setConflict(true);setPrompt(null);}};
    const orientation=matchMedia("(pointer: coarse) and (orientation: portrait) and (max-width: 900px)");
    const motion=matchMedia("(prefers-reduced-motion: reduce)");
    const orient=()=>setPortrait(orientation.matches),reduce=()=>setReduced(motion.matches);
    orient();reduce();orientation.addEventListener("change",orient);motion.addEventListener("change",reduce);if(preview)window.addEventListener("storage",changed);
    return()=>{orientation.removeEventListener("change",orient);motion.removeEventListener("change",reduce);window.removeEventListener("storage",changed);};
  },[key,preview]); // Only server mode reads the original journey credentials.

  useEffect(()=>{
    if(preview && loaded && !storageError && !conflict && initialSegment==="storm" && state.segment==="carry")
      router.replace("/l3?preview=1&segment=carry&from=storm");
  },[preview,loaded,storageError,conflict,state,router]);
  useEffect(()=>{if(!preview){setPrompt(null);}},[preview,segment,conflict]);
  useEffect(()=>{if(modal)dialog.current?.showModal();else dialog.current?.close();},[modal]);
  useEffect(()=>{if(portrait)rotation.current?.showModal();else rotation.current?.close();},[portrait]);
  useEffect(()=>{if(prompt)heading.current?.focus({preventScroll:true});},[prompt]);
  function persist(next:State) {
    try {
      if(localStorage.getItem(key)!==lastRaw.current){setConflict(true);setPrompt(null);return false;}
      const raw=serialize(next);localStorage.setItem(key,raw);lastRaw.current=raw;current.current=next;setState(next);return true;
    } catch {setStorageError("保存失败，当前操作未保存。请检查浏览器存储权限后重试读取。");return false;}
  }
  async function act(action:Action) {
    if(blocked)return false;
    if(!preview)return server.act(action);
    const next=transition(current.current,{id:crypto.randomUUID(),at:new Date().toISOString(),action});
    // Persist the unchanged record to retain storage failure/conflict handling.
    // A repeated refusal must still acknowledge and close the scene prompt.
    if(next===current.current)return isRepeatedDecision(current.current,action) && persist(current.current);
    return persist(next);
  }
  async function decide(slot:Decision,yes:boolean) {
    if(await act({type:"decision",slot,yes})){
      setPrompt(null);setContinuePreparing(false);
      setMessage(slot==="open"&&!yes?"门保持半开。":slot==="close"&&!yes?"门保持原状。":slot==="close"?"门已关上。":slot==="wait"&&yes?"已坐下等待。":slot==="open"?"门已打开。":!yes?"已保留原状。":slot==="curtain"?"窗帘拉开了。":slot==="window"?"左边的窗户关好了。":slot==="right-window"?"右边的窗户关好了。":"电视机电源关闭了。");
    }
  }
  async function resetAll() {
    if(!preview){if(!await server.restart())setModal(null);return;}
    const stormKey=`${SAVE_KEY}:storm`,carryKey=`${SAVE_KEY}:carry`;
    let previousCarry:string|null=null,carryWritten=false;
    try {
      previousCarry=localStorage.getItem(carryKey);
      localStorage.setItem(carryKey,serialize(initialState("carry")));carryWritten=true;
      localStorage.setItem(stormKey,serialize(initialState("storm")));
      window.location.assign("/l3?preview=1");
    } catch {
      if(carryWritten)try {
        if(previousCarry===null)localStorage.removeItem(carryKey);else localStorage.setItem(carryKey,previousCarry);
      } catch { /* Keep the failure visible; never navigate on a partial reset. */ }
      setStorageError("未能重新开始整个 L3，请检查浏览器存储权限后重试。");setModal(null);
    }
  }
  function reset() {
    if(!preview)return;
    // Explicit destructive confirmation applies only to this segment's preview.
    try {const next=initialState(segment);const raw=serialize(next);localStorage.setItem(key,raw);lastRaw.current=raw;current.current=next;setState(next);setStorageError("");setConflict(false);setPrompt(null);setModal(null);setMessage("已重新开始当前片段的本地预览。");}
    catch {setStorageError("无法重置本地存档，请检查浏览器存储权限。");setModal(null);}
  }
  async function chooseItem(item:Item){
    if(blocked||prompt||state.carry!==true||state.item!==null)return;
    if(state.draft===item||await act({type:"draft",item})){
      setPrompt("confirm");setMessage("");
    }
  }
  const done=state.carry===false||state.item!==null;
  const selected=state.draft;
  return <main className={`${styles.game} ${segment==="carry"?styles.carryGame:""} ${reduced?styles.reduced:""}`} data-segment={segment}>
    {!entered&&<ActOpening journeyId={preview?"preview-l3":server.sessionId} resume={state.events.length>0} act="第三幕" title="风暴大厅" prompt="风暴来临，你会如何选择？" ready={ready&&loaded&&!portrait&&!modal&&!storageError&&!conflict&&!server.error} onEnter={()=>setEntered(true)}/>}
    <section className={styles.stage} aria-label="第三幕游戏舞台">
      <Scene state={preview&&segment==="carry"&&preparationChoices?{...state,choices:preparationChoices}:state} blocked={blocked||!!prompt} reduced={reduced} onPrompt={setPrompt} onCarryStart={()=>{}} onItem={chooseItem}/>
      <LevelHeading className={styles.heading} ready={entered&&ready&&loaded&&!portrait} after={segment==="storm"&&!stormComplete(state)?<><p>本关任务：</p><p>请在风暴来临之前，完成你认为重要的准备工作。</p></>:undefined}><h1>风暴大厅</h1></LevelHeading>
      {segment==="storm"&&stormComplete(state)&&entered&&!prompt&&<div className={styles.preparationActions} aria-label="准备进度选择">
        <button disabled={blocked} className={styles.primary} onClick={async()=>{if(await act({type:"finish-preparation"})){setPrompt(null);setMessage("");}}}>我已完成</button>
        {!continuePreparing&&<button disabled={blocked} onClick={()=>{setContinuePreparing(true);setMessage("可以继续选择房间里的物品，准备好后点击我已完成。");}}>继续做准备</button>}
      </div>}
      <button className={styles.menu} aria-label="打开第三幕菜单" onClick={()=>{setPrompt(null);setModal("menu");}}>☰</button>
      {segment==="carry"&&state.carry===null&&<section className={`${styles.bubble} ${styles.centerBubble}`} data-game-prompt aria-label="携带物品选择">
        <h2>最多只能带走一件物品</h2>
        <div className={styles.actions}>
          <button disabled={blocked} onClick={async()=>{if(await act({type:"carry",yes:false}))setMessage("");}}>不带走</button>
          <button disabled={blocked} className={`${styles.primary} gameYes`} onClick={async()=>{if(await act({type:"carry",yes:true}))setMessage("");}}>开始选择</button>
        </div>
      </section>}
      {done&&<div className={styles.exitAction} data-game-prompt><button className={`${styles.primary} gameYes`} disabled={blocked} onClick={()=>router.push(preview?"/l4?preview=1":"/l4")}>走出密室 →</button></div>}
      {showCarryToast&&<div className={styles.carryToast} data-game-prompt role="status"><p>{state.item?`你收好了${items[state.item]}。`:"你决定不带走任何物品。"}</p></div>}
      {prompt&&<section style={prompt==="confirm"?{left:`${Math.max(19,Math.min(81,((carrySlots.find(slot=>slot.id===selected)?.x??960)+(carrySlots.find(slot=>slot.id===selected)?.w??0)/2)/1920*100))}%`,top:`${(carrySlots.find(slot=>slot.id===selected)?.y??700)/1049*100}%`}:undefined} className={`${styles.bubble} ${prompt==="confirm"?styles.itemBubble:prompt==="open"||prompt==="close"?styles.doorBubble:prompt==="curtain"||prompt==="right-window"||prompt==="television"?styles.rightBubble:prompt==="window"?styles.windowBubble:prompt==="wait"?styles.waitBubble:styles.centerBubble}`} data-game-prompt aria-label="场景提示">
        <div className={styles.bubbleTitle}><h2 tabIndex={-1} ref={heading}>{prompt==="confirm"?`带走${selected?items[selected]:"这件物品"}`:questions[prompt]}</h2><button aria-label="关闭提示，继续探索" onClick={()=>setPrompt(null)}>×</button></div>
        <div className={styles.actions}>
          {prompt==="confirm"?<><button disabled={blocked} onClick={()=>setPrompt(null)}>返回挑选</button><button disabled={blocked} className={`${styles.primary} gameYes`} onClick={async()=>{if(await act({type:"confirm"})){setPrompt(null);setMessage("");}}}>是</button></>:<><button disabled={blocked} onClick={async()=>{decide(prompt,false);}}>否</button><button disabled={blocked} className={`${styles.primary} gameYes`} onClick={async()=>{decide(prompt,true);}}>是</button></>}
        </div>
      </section>}
      {!prompt&&message&&<p className={styles.status} role="status">{!preview&&server.busy?"请稍候…":message}</p>}
      {(!ready||(!loaded&&!server.error))&&<div className={styles.loading}>{assetError?<><p>场景素材加载失败。</p><button onClick={()=>setAttempt(v=>v+1)}>重新加载素材</button></>:<p>正在载入风暴大厅…</p>}</div>}
      {preview&&(storageError||conflict||full)&&<div className={styles.notice} role="alert"><p>{playerMessage(storageError|| (conflict?"另一个页面更新了旅程，请重新载入。":"暂时无法继续，请重试或重新开始。"))}</p><button onClick={load}>重新载入</button><button onClick={()=>setModal("reset")}>重新开始此片段</button></div>}
      {!preview&&(server.error||conflict||full)&&<div className={styles.notice} role="alert"><p>{conflict?"其他页面更新了旅程，请重新载入后继续。":playerMessage(server.error,"暂时无法继续，请重试或重新开始本幕。")}</p><button disabled={server.busy} onClick={load}>重试</button><button disabled={server.busy||conflict||!loaded} onClick={()=>setModal("reset-all")}>重新开始本幕</button></div>}
    </section>
    <dialog data-game-dialog ref={dialog} className={styles.dialog} onCancel={e=>{if(server.busy)e.preventDefault();else setModal(null);}}>
      <button className={styles.close} disabled={server.busy} aria-label="关闭菜单" onClick={()=>setModal(null)}>×</button>
      {modal==="menu"&&<><h2>风暴中的探索</h2><p>点击房间里的物件，作出你的选择。风暴平息后，可以挑选一件物品陪你继续旅程。</p><div className={styles.menuActions}><button onClick={()=>setModal(null)}>继续探索</button><button aria-pressed={reduced} onClick={()=>setReduced(v=>!v)}>减少场景动效：{reduced?"开":"关"}</button><button disabled={server.busy||conflict||!loaded} onClick={()=>setModal("reset-all")}>重新开始本幕</button></div></>}
      {modal==="reset-all"&&<><h2>重新开始本幕？</h2><p>将重新开始第三幕的准备工作和携带物品选择，保留第一幕和第二幕的进度。</p><div className={styles.actions}><button disabled={server.busy} onClick={()=>setModal("menu")}>取消</button><button disabled={server.busy||conflict||!loaded} onClick={resetAll}>{server.busy?"正在重新开始…":"确认重新开始本幕"}</button></div></>}
      {modal==="reset"&&preview&&<><h2>重新探索当前场景？</h2><p>将重新开始当前场景的探索。</p><div className={styles.actions}><button onClick={()=>setModal("menu")}>取消</button><button onClick={reset}>确认重新开始</button></div></>}
    </dialog>
    <dialog data-game-dialog ref={rotation} className={styles.dialog} onCancel={e=>e.preventDefault()}><h2>请翻转手机</h2><p>为了保证用户体验请翻转手机为横屏</p></dialog>
  </main>;
}
