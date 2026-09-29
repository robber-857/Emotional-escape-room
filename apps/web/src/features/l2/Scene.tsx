import {FurniturePiece} from "./FurniturePiece";
import {furnitureIds,type FurnitureId,type Point} from "./layout";
import { seatNames, type KeyId, type Seat, type State } from "./model";
import styles from "./l2.module.css";
export const assets=["cabinet.png","cabinet-mask.svg","earring.png","door-panel.png","bedroom.png","table-view.png","room.png","chair.png","sofa.png","armchair.png","table-chair.png","keys.png","detail.svg"];
export function KeySprite({id}:{id:KeyId}) {
 return <svg viewBox="0 0 51 44" width="51" height="44" overflow="hidden" aria-hidden="true"><image href="/game/l2/keys.png" x={id==="key-1"?0:-59.9454} y="0" width="111.0015" height="44" preserveAspectRatio="none" /></svg>;
}
function ImageLayer({id,x,y,w,h,crop=[0,0,1,1],opacity=1}:{id:string;x:number;y:number;w:number;h:number;crop?:number[];opacity?:number}){
 return <svg data-layer={id} x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="hidden" opacity={opacity}>
  <image href={`/game/l2/${id}.png`} x={crop[0]*w} y={crop[1]*h} width={crop[2]*w} height={crop[3]*h} preserveAspectRatio="none" />
 </svg>;
}
export function Scene({state,disabled,onSeat,onTable,onDoor,onExit,onKey,onSearch,onFind,onMove}:{state:State;disabled:boolean;onSeat:(seat:Seat)=>void;onTable:()=>void;onDoor:()=>void;onExit:()=>void;onKey:(key:KeyId)=>void;onSearch:()=>void;onFind:()=>void;onMove:(id:FurnitureId,p:Point)=>void}){
 function hit(name:string,x:number,y:number,w:number,h:number,fn:()=>void){
  return <g role="button" aria-label={name} aria-disabled={disabled} tabIndex={disabled?-1:0} className={styles.hotspot}
   onClick={()=>{if(!disabled)fn();}} onKeyDown={e=>{if(!disabled&&(e.key==="Enter"||e.key===" ")){e.preventDefault();fn();}}}>
    <rect x={x} y={y} width={w} height={h} rx="15" />
  </g>;
 }
 if(state.view==="bedroom")return <svg className={styles.scene} viewBox="0 0 1920 1049" role="img" aria-label="失联房间：卧室">
  <image data-layer="bedroom" href="/game/l2/bedroom.png" x="-29" y="0" width="1978" height="1113" preserveAspectRatio="xMidYMid slice"/>
  {<svg data-layer="earring-clue" x="379" y="690" width="17" height="27" overflow="hidden"><image href="/game/l2/earring.png" x={17*-.4656} y={27*-.6732} width={17*3.6641} height={27*2.3415} preserveAspectRatio="none"/></svg>}
  {state.search.status==="found"&&<svg data-layer="found-earring" x="1265" y="770" width="25" height="40" overflow="hidden"><image href="/game/l2/earring.png" x={25*-.4656} y={40*-.6732} width={25*3.6641} height={40*2.3415} preserveAspectRatio="none"/></svg>}
  {state.search.status==="searching"?hit("查看窗帘附近",1155,145,150,700,onFind):state.search.status!=="found"&&<>{hit("查看桌上的耳环",350,658,75,85,onSearch)}{hit("查看梳妆台",1350,510,285,260,onSearch)}</>}

 </svg>;
 if(state.view==="table")return <svg className={styles.scene} viewBox="0 0 1920 1049" role="img" aria-label="失联房间：坐在桌前">
  <svg x="-100" y="0" width="2048" height="1088" overflow="hidden"><image data-layer="table-view" href="/game/l2/table-view.png" x="92.3648" y="-583.3856" width="2048" height="1768.4352" preserveAspectRatio="none"/></svg>
  {(["key-1","key-2"] as KeyId[]).map((key,i)=>!state.keys.includes(key)&&<g key={key} data-layer={key}>
   <g transform={`translate(${760+i*270} 420) scale(2.7)`}><KeySprite id={key}/></g>
   {hit(`拿起${key==="key-1"?"钥匙1":"钥匙2"}`,740+i*270,400,185,170,()=>onKey(key))}
  </g>)}
 </svg>;
 return <svg className={`${styles.scene} ${state.furniture.editing?styles.arranging:""}`} viewBox="0 0 1920 1049" role="img" aria-label="失联房间：大厅">
  <defs><mask id="l2-cabinet-mask" maskUnits="userSpaceOnUse" x="-46.501" y="286.393" width="288.908" height="870.419" style={{maskType:"alpha"}}><image href="/game/l2/cabinet-mask.svg" x="-46.501" y="286.393" width="288.908" height="870.419" /></mask></defs>
  <ImageLayer id="room" x={0} y={0} w={1919.008} h={1048.989}/>
  {state.exitDoorOpen&&<g data-layer="l2-exit-door">
   <defs><clipPath id="l2-exit-leaf"><path d="M444 223 L579 242 L579 787 L444 799 Z"/></clipPath><linearGradient id="l2-exit-depth"><stop stopColor="#161218"/><stop offset="1" stopColor="#332932"/></linearGradient></defs>
   <path d="M444 223 L579 242 L579 787 L444 799 Z" fill="url(#l2-exit-depth)"/>
   <g transform="translate(579 0) scale(.23 1) translate(-579 0)"><image clipPath="url(#l2-exit-leaf)" href="/game/l2/room.png" width="1919.008" height="1048.989" preserveAspectRatio="none"/></g>
  </g>}
  {state.doorOpen&&<g data-layer="half-open-door">
   <svg x="761" y="271" width="156" height="505" overflow="hidden"><image href="/game/l2/door-panel.png" x={-763-1919.008*.0153} y={-267+1048.989*.0014} width={1919.008*1.0755} height={1048.989*1.0589} preserveAspectRatio="none"/></svg>
   <rect x="917" y="269" width="17" height="507" fill="#050505" style={{filter:"blur(3.6px)"}}/>
  </g>}
  <image data-layer="detail" href="/game/l2/detail.svg" x="633" y="321.49" width="10" height="10"/>
  {[...furnitureIds].sort((a,b)=>state.furniture.layout[a].v-state.furniture.layout[b].v).map(id=><FurniturePiece key={id} id={id} point={state.furniture.layout[id]} editing={state.furniture.editing} disabled={disabled} onMove={onMove}>
   {id==="chair"&&<><g style={{filter:"blur(.65px) drop-shadow(-2px 4px 7.6px #0005)"}}><ImageLayer id="chair" x={1059} y={574} w={173} h={247} opacity={.84} crop={[-.3095,-.1535,1.571,1.2876]}/></g>{!state.furniture.editing&&hit(`坐在${seatNames.chair}`,1060,577,170,240,()=>onSeat("chair"))}</>}
   {id==="sofa"&&<ImageLayer id="sofa" x={1176} y={581} w={768} h={370} crop={[-.0548,-.2011,1.099,1.3554]}/>}
   {id==="armchair"&&<g style={{filter:"blur(.65px) drop-shadow(-16px 22px 28.8px #0005)"}}><ImageLayer id="armchair" x={42} y={585} w={470} h={422} opacity={.88}/></g>}
   {id==="table-chair"&&<><ImageLayer id="table-chair" x={941} y={739} w={979} h={310} crop={[-.0014,0,1.2286,1]}/>
    {!state.keys.includes("key-1")&&<g data-layer="key-1" transform="translate(1329.024 938.01)" opacity=".56"><KeySprite id="key-1"/></g>}
    {!state.keys.includes("key-2")&&<g data-layer="key-2" transform="translate(1398.912 938.01)" opacity=".70"><KeySprite id="key-2"/></g>}
    {!state.furniture.editing&&<>{hit(`坐在${seatNames["table-seat"]}`,1145,741,350,166,()=>onSeat("table-seat"))}{hit("走到桌边",1040,920,510,129,onTable)}</>}
   </>}
  </FurniturePiece>)}
  {/* The foreground cabinet occludes the armchair in exploration mode. */}
  {!state.furniture.editing&&<g mask="url(#l2-cabinet-mask)"><ImageLayer id="cabinet" x={-46} y={166.77} w={302.458} h={1076.751}/></g>}
  {!state.furniture.editing&&hit(state.doorOpen?"查看半开的门":"查看门锁",745,285,180,480,onDoor)}

  {state.exitDoorOpen&&!state.furniture.editing&&hit("查看通往第三幕的门",444,242,135,390,onExit)}
  {state.keys.length<2&&<title>{`桌上有${2-state.keys.length}把尚未拿起的钥匙`}</title>}
 </svg>;
}
