"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {assets,Scene} from "./Scene";
import {SAVE_KEY,MAX_EVENTS,items,initialState,stormComplete,transition,isRepeatedDecision,serialize,restore,describe,type State,type Segment,type Decision,type Item,type Action} from "./model";
import styles from "./l3.module.css";

const questions:Record<Decision,string> = {
  open:"门半开着，要完全打开看看外面吗？",close:"要把门关上吗？",
  wait:"要坐稳等待吗？",curtain:"要拉开右窗的窗帘吗？",window:"要关闭左边的窗户吗？",fan:"要关掉电视机电源吗？",
};
type Prompt = Decision | "carry" | "confirm" | null;
export function L3Game({segment}:{segment:Segment}) {
  const router=useRouter();
  const key = `${SAVE_KEY}:${segment}`;
  const [state,setState] = useState(()=>initialState(segment));
  const current = useRef(state); const lastRaw = useRef<string|null>(null);
  const [loaded,setLoaded] = useState(false),[ready,setReady] = useState(false);
  const [assetError,setAssetError] = useState(false),[attempt,setAttempt] = useState(0);
  const [storageError,setStorageError] = useState(""),[conflict,setConflict] = useState(false);
  const [prompt,setPrompt] = useState<Prompt>(null),[modal,setModal] = useState<"menu"|"trace"|"reset"|"reset-all"|null>(null);
  const [televisionOff,setTelevisionOff] = useState(false);
  const [catalog,setCatalog] = useState(false);
  const [portrait,setPortrait] = useState(false),[reduced,setReduced] = useState(false);
  const [message,setMessage] = useState(segment === "storm" ? "门半开着，走近看看。" : "离开前，看看房间里有什么可以带走。");
  const dialog = useRef<HTMLDialogElement>(null),rotation = useRef<HTMLDialogElement>(null),heading = useRef<HTMLHeadingElement>(null);
  const full = state.events.length >= MAX_EVENTS;
  const blocked = !loaded || !ready || !!storageError || conflict || portrait || !!modal || full;
  function load() {
    try {
      const raw = localStorage.getItem(key); const saved = raw === null ? initialState(segment) : restore(raw,segment);
      if(segment==="carry"){
        const stormRaw=localStorage.getItem(`${SAVE_KEY}:storm`);
        setTelevisionOff(stormRaw!==null && restore(stormRaw,"storm").choices.fan===true);
      }
      current.current=saved;lastRaw.current=raw;setState(saved);setConflict(false);setStorageError("");setPrompt(null);setCatalog(false);
      if(raw!==null)setMessage("已恢复本浏览器中的 L3 预览记录。");
    } catch {setStorageError("本地预览存档无法读取。原数据已保留，可重试或明确重新开始。");}
    setLoaded(true);
  }
  useEffect(()=>{
    load();
    const changed=(e:StorageEvent)=>{if(e.key===key||e.key===null||(segment==="carry"&&e.key===`${SAVE_KEY}:storm`)){setConflict(true);setPrompt(null);}};
    const orientation=matchMedia("(pointer: coarse) and (orientation: portrait) and (max-width: 900px)");
    const motion=matchMedia("(prefers-reduced-motion: reduce)");
    const orient=()=>setPortrait(orientation.matches),reduce=()=>setReduced(motion.matches);
    orient();reduce();orientation.addEventListener("change",orient);motion.addEventListener("change",reduce);window.addEventListener("storage",changed);
    return()=>{orientation.removeEventListener("change",orient);motion.removeEventListener("change",reduce);window.removeEventListener("storage",changed);};
  },[key]); // Each segment has its own preview log; no L1/L2 credentials are accessed.
  useEffect(()=>{
    let live=true;setReady(false);setAssetError(false);
    Promise.all(assets.map(file=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=reject;img.src=`/game/l3/${file}`;}))).then(()=>{if(live)setReady(true);}).catch(()=>{if(live)setAssetError(true);});
    return()=>{live=false;};
  },[attempt]);
  useEffect(()=>{
    if(loaded && !storageError && !conflict && stormComplete(state))
      router.replace("/l3?preview=1&segment=carry&from=storm");
  },[loaded,storageError,conflict,state,router]);
  useEffect(()=>{if(modal)dialog.current?.showModal();else dialog.current?.close();},[modal]);
  useEffect(()=>{if(portrait)rotation.current?.showModal();else rotation.current?.close();},[portrait]);
  useEffect(()=>{if(prompt)heading.current?.focus({preventScroll:true});},[prompt]);
  function persist(next:State) {
    try {
      if(localStorage.getItem(key)!==lastRaw.current){setConflict(true);setPrompt(null);return false;}
      const raw=serialize(next);localStorage.setItem(key,raw);lastRaw.current=raw;current.current=next;setState(next);return true;
    } catch {setStorageError("保存失败，当前操作未保存。请检查浏览器存储权限后重试读取。");return false;}
  }
  function act(action:Action) {
    if(blocked)return false;
    const next=transition(current.current,{id:crypto.randomUUID(),at:new Date().toISOString(),action});
    // Persist the unchanged record to retain storage failure/conflict handling.
    // A repeated refusal must still acknowledge and close the scene prompt.
    if(next===current.current)return isRepeatedDecision(current.current,action) && persist(current.current);
    return persist(next);
  }
  function decide(slot:Decision,yes:boolean) {
    if(act({type:"decision",slot,yes})){
      setPrompt(null);
      setMessage(slot==="open"&&!yes?"先不完全打开门，接下来可以决定是否关上它。":slot==="close"&&!yes?"门保持原状。看看窗边和电源，或先坐稳等待。":slot==="close"?"门刚关上，雷声响起。看看窗边和电源，或先坐稳等待。":slot==="wait"&&yes?"你坐稳了，外面的风雨还在继续。":slot==="open"?"门打开了，外面风雨欲来。要关上门吗？":!yes?"先不动它，再看看房间里的其他地方。":slot==="curtain"?"窗帘拉开了。":slot==="window"?"左边的窗户关好了。":"电视机电源关闭了。");
    }
  }
  function resetAll() {
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
    // Explicit destructive confirmation applies only to this segment's preview.
    try {const next=initialState(segment);const raw=serialize(next);localStorage.setItem(key,raw);lastRaw.current=raw;current.current=next;setState(next);setStorageError("");setConflict(false);setPrompt(null);setModal(null);setCatalog(false);setMessage("已重新开始当前片段的本地预览。");}
    catch {setStorageError("无法重置本地存档，请检查浏览器存储权限。");setModal(null);}
  }
  function chooseItem(item:Item){
    if(blocked||prompt)return;
    if(current.current.draft===item||act({type:"draft",item})){
      setCatalog(false);setMessage(`已预选${items[item]}，确认前可以更换。`);
    }
  }
  const done=state.carry===false||state.item!==null;
  const selected=state.draft;
  return <main className={`${styles.game} ${segment==="carry"?styles.carryGame:""} ${reduced?styles.reduced:""}`} data-segment={segment}>
    <section className={styles.stage} aria-label="第三幕本地预览舞台">
      <Scene televisionOff={segment==="storm"?state.choices.fan===true:televisionOff} state={state} blocked={blocked||!!prompt||catalog} reduced={reduced} onPrompt={setPrompt} onCarryStart={()=>{if(!blocked)setPrompt("carry");}} onItem={chooseItem}/>
      <header className={styles.heading}><p>第三幕 · {segment==="storm"?"01":"02"}</p><h1>风暴大厅</h1><span>本地预览 · 未上传服务器</span></header>
      <button className={styles.menu} aria-label="打开预览菜单" onClick={()=>{setPrompt(null);setModal("menu");}}>☰</button>
      {segment==="carry"&&state.carry===true&&!done&&catalog&&!prompt&&<section className={styles.selection} aria-label="物品近景选择">
        <div className={styles.bubbleTitle}><h2>选择一件随身物品</h2><button aria-label="收起物品清单" onClick={()=>setCatalog(false)}>×</button></div><p>也可以收起清单，直接点击房间里的物品。指南针图像待补，保留文字选择。</p>
        <div className={styles.items}>{(Object.keys(items) as Item[]).map(id=><button key={id} disabled={blocked||!!prompt} aria-label={`${items[id]}${selected===id?" · 已预选":""}`} aria-pressed={selected===id} onClick={()=>chooseItem(id)}>
          {id!=="compass"?<img src={`/game/l3/${id}.png`} alt=""/>:<span className={styles.missing}>素材待补</span>}<span>{items[id]}{selected===id?" · 已预选":""}</span>
        </button>)}</div>
        <button className={styles.primary} disabled={blocked||!selected||!!prompt} onClick={()=>setPrompt("confirm")}>{selected?`确认携带${items[selected]}`:"请先预选一件物品"}</button>
      </section>}
      {segment==="carry"&&state.carry===true&&!done&&!catalog&&!prompt&&<section className={styles.carryChoice} aria-label="携带物品选择">
        <p>{selected?`已预选 · ${items[selected]}`:"只带一件 · 点击房间里的物品"}</p>
        {selected&&<div className={styles.itemPreview}>{selected!=="compass"?<img src={`/game/l3/${selected}.png`} alt={items[selected]}/>:<span>指南针 · 图像待补</span>}</div>}
        <div className={styles.actions}><button disabled={blocked||!!prompt} onClick={()=>setCatalog(true)}>查看物品清单</button>{selected&&<button disabled={blocked||!!prompt} className={styles.primary} onClick={()=>setPrompt("confirm")}>确认携带{items[selected]}</button>}</div>
      </section>}
      {done&&<section className={styles.result} aria-label="本地选择结果"><h2>{state.item?`已选择携带${items[state.item]}`:"已选择不带物品"}</h2><p>{state.item?"物品已收好。":"你决定不带走任何物品。"}本次选择已保存在本地。</p><button onClick={()=>setModal("trace")}>查看本地记录</button></section>}
      <aside className={styles.inventory} aria-label="随身物品"><span>物品</span>{state.item?<><span className={segment==="carry"?styles.inventoryName:undefined}>{items[state.item]}</span>{state.item!=="compass"&&<img src={`/game/l3/${state.item}.png`} alt={items[state.item]}/>}</>:<small>{segment==="carry"?"空":"尚未携带"}</small>}</aside>
      {prompt&&<section className={`${styles.bubble} ${prompt==="open"||prompt==="close"?styles.doorBubble:prompt==="curtain"||prompt==="fan"?styles.rightBubble:prompt==="window"?styles.windowBubble:prompt==="wait"?styles.waitBubble:styles.centerBubble}`} aria-label="场景提示">
        <div className={styles.bubbleTitle}><h2 tabIndex={-1} ref={heading}>{prompt==="carry"?"你可以带走一件东西以备不时之需，要带吗？":prompt==="confirm"?`确定只携带${selected?items[selected]:"这一件物品"}吗？`:questions[prompt]}</h2><button aria-label="关闭提示，继续探索" onClick={()=>setPrompt(null)}>×</button></div>
        {prompt==="confirm"&&selected&&<div className={styles.confirmImage}>{selected!=="compass"?<img src={`/game/l3/${selected}.png`} alt={items[selected]}/>:<p>指南针 · 图像待补</p>}</div>}
        <div className={styles.actions}>
          {prompt==="confirm"?<><button disabled={blocked} onClick={()=>setPrompt(null)}>返回挑选</button><button disabled={blocked} className={styles.primary} onClick={()=>{if(act({type:"confirm"})){setPrompt(null);setMessage("已确认一件物品，仅保存于本地预览。");}}}>是，确认携带</button></>:<><button disabled={blocked} onClick={()=>{if(prompt==="carry"){if(act({type:"carry",yes:false})){setPrompt(null);setMessage("已确认不带物品。");}}else decide(prompt,false);}}>否</button><button disabled={blocked} className={styles.primary} onClick={()=>{if(prompt==="carry"){if(act({type:"carry",yes:true})){setPrompt(null);setMessage("挑选一件物品。点击查看近景，确认前可以更换。");}}else decide(prompt,true);}}>是</button></>}
        </div>
      </section>}
      {!prompt&&<p className={styles.status} role="status">{message}</p>}
      {(!ready||!loaded)&&<div className={styles.loading}>{assetError?<><p>场景素材加载失败。</p><button onClick={()=>setAttempt(v=>v+1)}>重新加载素材</button></>:<p>正在载入风暴大厅…</p>}</div>}
      {(storageError||conflict||full)&&<div className={styles.notice} role="alert"><p>{storageError|| (conflict?"另一个页面修改了本地记录，请读取最新预览。":"本地记录已满，请查看记录或重新开始此片段。")}</p><button onClick={load}>读取最新预览</button><button onClick={()=>setModal("trace")}>查看记录</button><button onClick={()=>setModal("reset")}>重新开始此片段</button></div>}
    </section>
    <dialog ref={dialog} className={styles.dialog} onCancel={()=>setModal(null)}>
      <button className={styles.close} aria-label="关闭菜单" onClick={()=>setModal(null)}>×</button>
      {modal==="menu"&&<><h2>L3 前端预览</h2><p>当前记录只在本浏览器，未上传服务器。不读取或改变 L1/L2 会话；正式评分待配置。</p><p>L3-01 六项选择都回答后进入物品选择，是或否都算完成。菜单中的独立预览入口可直接体验物品段。</p>
        <p>沙发素材待补，“坐稳等待”标记暂用于体验相应选择。电视从进入第三幕起显示，关闭电源后黑屏，选择否则保持原画面。</p><div className={styles.menuActions}><button onClick={()=>setModal(null)}>继续预览</button><button onClick={()=>setModal("trace")}>本地选择记录</button><button aria-pressed={reduced} onClick={()=>setReduced(v=>!v)}>减少动态效果：{reduced?"开":"关"}</button><button onClick={()=>setModal("reset")}>重新开始此片段</button>
        <button onClick={()=>setModal("reset-all")}>重新开始整个 L3</button>
        {segment==="storm"&&<Link href="/l3?preview=1&segment=carry">独立预览物品选择</Link>}<Link href="/l2">返回 L2（服务器存档）</Link></div></>}
      {modal==="trace"&&<><h2>本地选择记录</h2><p>来源：浏览器 localStorage。以下不是服务器回执；A/V/T/F 待配置，贡献为 null。同一动作的“是”和“否”各保留首次记录，重复选择不叠加。</p><p>{state.events.length} 条记录 · {segment==="storm"?"风暴片段":"物品片段（独立预览入口）"}</p>{!state.events.length?<p>尚无选择记录。</p>:<ol>{state.events.map(e=><li key={e.id}><strong>{describe(e.action)}</strong><small>{e.at} · {e.id}</small></li>)}</ol>}<button onClick={()=>setModal("menu")}>返回菜单</button></>}
      {modal==="reset-all"&&<><h2>从头重新体验 L3？</h2><p>将清除 L3-01 的全部选择和 L3-02 的携带物品记录，从半开的门重新开始。仅清除本浏览器的 L3 预览，L1/L2 存档不受影响。</p><div className={styles.actions}><button onClick={()=>setModal("menu")}>取消</button><button onClick={resetAll}>确认重新开始整个 L3</button></div></>}
      {modal==="reset"&&<><h2>清除当前片段的本地预览？</h2><p>将清除此片段的选择、草稿和本地事件记录。另一个 L3 片段和 L1/L2 的服务器存档不受影响。</p><div className={styles.actions}><button onClick={()=>setModal("menu")}>取消</button><button onClick={reset}>确认重新开始</button></div></>}
    </dialog>
    <dialog ref={rotation} className={styles.dialog} onCancel={e=>e.preventDefault()}><h2>请翻转手机</h2><p>为了保证用户体验请翻转手机为横屏</p></dialog>
  </main>;
}
