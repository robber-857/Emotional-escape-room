import {gameAsset} from "../shared/gameAsset";
import {canDecide,type Decision, type State,type Item} from "./model";
import {RoomBackground} from "./RoomBackground";
import {CarryScene} from "./CarryScene";
import styles from "./l3.module.css";

export const assets = ["entry.png","outside.png","storm.png","closed-window.png","curtain.png","curtain-mask.svg","open-curtain-window-open.png","open-curtain.png","open-curtain-mask.svg","detail.svg","scarf.png","lantern.png","umbrella.png","doll.png","key.png","journal.png","rope.png","backpack.png","tv.png","tv-screen.png","waiting-sofa-front.png"];
export function Scene({state,blocked,reduced,onPrompt,onItem,onCarryStart}:{state:State;blocked:boolean;reduced:boolean;onPrompt:(d:Decision)=>void;onItem:(id:Item)=>void;onCarryStart:()=>void}) {
  if(state.segment==="carry")return <CarryScene state={state} blocked={blocked} onItem={onItem} onStart={onCarryStart}/>;
  const storm = state.choices.close === true;
  const actionsReady = state.choices.close !== null;
  const opened = state.choices.open === true;
  function hit(slot:Decision,x:number,y:number,w:number,h:number,label:string,caption?:string) {
    if(!canDecide(state,slot))return null;
    const disabled = blocked;
    return <g role="button" aria-label={label} aria-disabled={disabled} tabIndex={disabled?-1:0} className={styles.hotspot}
      onClick={()=>{if(!disabled)onPrompt(slot);}} onKeyDown={e=>{if(!disabled&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onPrompt(slot);}}}>
      <rect x={x} y={y} width={w} height={h} rx="12"/>
      {caption&&<g className={styles.marker} aria-hidden="true" transform={`translate(${x+w/2} ${y+h/2})`}><rect x="-110" y="-33" width="220" height="66" rx="20"/><text textAnchor="middle" dominantBaseline="central">{caption}</text></g>}
    </g>;
  }
  return <svg className={`${styles.scene} ${storm&&!reduced?styles.storm:""}`} viewBox="0 0 1920 1049" aria-label="风暴大厅场景">
    <RoomBackground choices={state.choices}/>
    {/* Keep the sofa's feet at the original waiting area; the back rises above it. */}
    <image href={gameAsset("/game/l3/waiting-sofa-front.png")} x="710" y="625" width="300" height="300" pointerEvents="none"/>
    <image href="/game/l3/detail.svg" x="633" y="321.49" width="10" height="10"/>
    {state.segment === "storm" && <>
      {state.choices.open === null ? hit("open",200,120,340,710,"查看半开的门","看看门") : <>
        {!storm&&hit("open",200,120,340,160,"查看半开的门","看看门")}
        {hit("close",200,320,340,480,opened?"查看敞开的门":"决定是否关门","关上门？")}
      </>}
      {actionsReady&&<>
      {hit("window",690,140,580,500,"查看左窗")}{state.choices.curtain?hit("right-window",1480,140,430,540,"查看右窗"):hit("curtain",1480,140,430,540,"查看右窗窗帘")}
      {hit("television",1290,510,230,330,"查看电视机电源开关")}
      {hit("wait",710,625,300,300,"坐稳等待")}
</>}
    </>}
  </svg>;
}
