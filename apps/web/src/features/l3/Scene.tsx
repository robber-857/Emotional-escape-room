import {canDecide,type Decision, type State,type Item} from "./model";
import {Television} from "./Television";
import {Layer} from "./SceneLayer";
import {CarryScene} from "./CarryScene";
import styles from "./l3.module.css";

export const assets = ["carry-hint.svg","entry.png","outside.png","storm.png","closed-window.png","curtain.png","curtain-mask.svg","open-curtain.png","open-curtain-mask.svg","detail.svg","scarf.png","lantern.png","umbrella.png","doll.png","key.png","journal.png","rope.png","backpack.png","tv.png","tv-screen.png"];
export function Scene({state,blocked,reduced,onPrompt,onItem,onCarryStart,televisionOff}:{televisionOff:boolean;state:State;blocked:boolean;reduced:boolean;onPrompt:(d:Decision)=>void;onItem:(id:Item)=>void;onCarryStart:()=>void}) {
  if(state.segment==="carry")return <CarryScene televisionOff={televisionOff} state={state} blocked={blocked} onItem={onItem} onStart={onCarryStart}/>;
  const storm = state.choices.close === true;
  const actionsReady = state.choices.close !== null;
  const opened = state.choices.open === true;
  function hit(slot:Decision,x:number,y:number,w:number,h:number,label:string,caption:string) {
    if(!canDecide(state,slot))return null;
    const disabled = blocked;
    return <g role="button" aria-label={label} aria-disabled={disabled} tabIndex={disabled?-1:0} className={styles.hotspot}
      onClick={()=>{if(!disabled)onPrompt(slot);}} onKeyDown={e=>{if(!disabled&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onPrompt(slot);}}}>
      <rect x={x} y={y} width={w} height={h} rx="12"/>
      <g className={styles.marker} aria-hidden="true" transform={`translate(${x+w/2} ${y+h/2})`}><rect x="-94" y="-33" width="188" height="66" rx="20"/><text textAnchor="middle" dominantBaseline="central">{caption}</text></g>
    </g>;
  }
  return <svg className={`${styles.scene} ${storm&&!reduced?styles.storm:""}`} viewBox="0 0 1920 1049" aria-label="风暴大厅场景">
    <defs>
      <mask id="l3-open-curtain" maskUnits="userSpaceOnUse" x="1459.363" y="9.469" width="521.637" height="818.581" style={{maskType:"alpha"}}><image href="/game/l3/open-curtain-mask.svg" x="1459.363" y="9.469" width="521.637" height="818.581"/></mask>
      <mask id="l3-closed-curtain" maskUnits="userSpaceOnUse" x="1459.363" y="9.469" width="521.637" height="818.581" style={{maskType:"alpha"}}><image href="/game/l3/curtain-mask.svg" x="1459.363" y="9.469" width="521.637" height="818.581"/></mask>
    </defs>
    {storm ? state.choices.window ? <Layer name="closed-window"/> : <Layer name="storm" crop={[-.0064,-.046,1.1262,1.0951]}/> : opened ? <Layer name="outside" crop={[-.0082,-.0501,1.1297,1.0985]}/> : <Layer name="entry" x={-15} crop={[-.0064,-.0539,1.1392,1.1077]}/>}
    {storm && (state.choices.curtain ? <g mask="url(#l3-open-curtain)"><Layer name="open-curtain" x={-129} y={-18} w={2071} h={1115}/></g> : state.choices.window && <g mask="url(#l3-closed-curtain)"><Layer name="curtain" x={49.5} y={-51.5} w={2106} h={1134} crop={[-.013,.0004,1.013,.9994]}/></g>)}
    <Television off={televisionOff}/>
    <image href="/game/l3/detail.svg" x="633" y="321.49" width="10" height="10"/>
    {state.segment === "storm" && <>
      {state.choices.open === null ? hit("open",200,120,340,710,"查看半开的门","看看门") : <>
        {!storm&&hit("open",200,120,340,160,"查看半开的门","看看门")}
        {hit("close",200,320,340,480,opened?"查看敞开的门":"决定是否关门","关上门？")}
      </>}
      {actionsReady&&<>
      {hit("window",690,140,580,500,"查看左窗","查看左窗")}{hit("curtain",1480,140,430,540,"查看右窗窗帘","拉开窗帘？")}
      {hit("fan",1248,464,188,132,"查看电视机电源开关","电视电源？")}
      {hit("wait",710,795,300,130,"坐稳等待","坐稳等待？")}
</>}
    </>}
  </svg>;
}
