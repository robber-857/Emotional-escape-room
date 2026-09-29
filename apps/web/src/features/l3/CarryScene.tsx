import {items,type Item,type State} from "./model";
import {Television} from "./Television";
import {Layer} from "./SceneLayer";
import styles from "./l3.module.css";

// Frame 50 (83:115). Art stays in its Figma slot; hit areas are enlarged separately.
export const carrySlots = [
  {id:"umbrella",node:"83:141",x:1538,y:666,w:310,h:285},
  {id:"key",node:"83:296",x:550,y:764,w:46,h:46},
  {id:"lantern",node:"83:297",x:626,y:650,w:203.4111,h:203.4111,opacity:.9},
  {id:"doll",node:"83:298",x:718,y:669,w:203.4111,h:203.4111,opacity:.9},
  {id:"backpack",node:"83:299",x:19,y:733,w:152,h:239,crop:[-.3406,-.1213,1.6794,1.2469],opacity:.8},
  {id:"rope",node:"83:300",x:470,y:812,w:203.4111,h:203.4111,opacity:.9},
  {id:"journal",node:"83:301",x:1007,y:824,w:203.4111,h:203.4111,opacity:.9},
  {id:"scarf",node:"83:302",x:322,y:872,w:203.4111,h:203.4111,opacity:.9},
] satisfies {id:Item;node:string;x:number;y:number;w:number;h:number;crop?:number[];opacity?:number}[];

export function CarryScene({state,blocked,onItem,onStart,televisionOff}:{televisionOff:boolean;state:State;blocked:boolean;onItem:(id:Item)=>void;onStart:()=>void}) {
  const done=state.item!==null||state.carry===false;
  function choose(id:Item){if(!blocked&&!done){if(state.carry===null)onStart();else onItem(id);}}
  return <svg className={styles.scene} viewBox="0 0 1920 1049" aria-label="风暴大厅：携带物品场景" data-figma-node="83:115">
    <Layer name="entry" x={-15} h={1048.989} crop={[-.0064,-.0539,1.1392,1.1077]}/>
    <Television off={televisionOff}/>
    <image href="/game/l3/detail.svg" x="633" y="321.49" width="10" height="10"/>
    {state.carry===null&&<g role="button" aria-label="查看可携带的物品" aria-disabled={blocked} tabIndex={blocked?-1:0} className={styles.carryHint}
      onClick={()=>{if(!blocked)onStart();}} onKeyDown={e=>{if(!blocked&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onStart();}}}>
      <image href="/game/l3/carry-hint.svg" x="282" y="346" width="268.252" height="105.622"/>
      <text x="416" y="386" textAnchor="middle" dominantBaseline="central">带一件物品？</text>
    </g>}
    {carrySlots.map(slot=>state.item===slot.id?null:<g key={slot.id} data-item={slot.id} data-figma-node={slot.node}>
      <Layer name={slot.id} {...slot}/>
    </g>)}
    {!done&&carrySlots.map(slot=>{
      // The small key needs a touch target without inflating its image.
      const w=slot.id==="key"?120:slot.id==="lantern"?115:slot.id==="doll"?135:slot.w;
      const h=slot.id==="key"?120:slot.h;
      const x=slot.x+(slot.w-w)/2,y=slot.y+(slot.h-h)/2;
      const selected=state.draft===slot.id;
      return <g key={slot.id} role="button" aria-label={`查看${items[slot.id]}`} aria-pressed={selected} aria-disabled={blocked} tabIndex={blocked?-1:0}
        className={`${styles.pickable} ${selected?styles.picked:""}`} data-item-hit={slot.id}
        onClick={()=>choose(slot.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(slot.id);}}}>
        <rect x={x} y={y} width={w} height={h} rx="14"/>
        <g className={styles.itemLabel} aria-hidden="true" transform={`translate(${x+w/2} ${y-18})`}>
          <rect x="-75" y="-29" width="150" height="58" rx="16"/><text textAnchor="middle" dominantBaseline="central">{items[slot.id]}</text>
        </g>
      </g>;
    })}
  </svg>;
}
