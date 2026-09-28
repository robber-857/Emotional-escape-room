import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from "react";
import {furniture,project,unproject,transformFurniture,type FurnitureId,type Point} from "./layout";
import styles from "./l2.module.css";
export function FurniturePiece({id,point,editing,disabled,onMove,children}:{id:FurnitureId;point:Point;editing:boolean;disabled:boolean;onMove:(id:FurnitureId,p:Point)=>void;children:ReactNode}){
 const [draft,setDraft]=useState<Point|null>(null);const drag=useRef<{pointer:number;x:number;y:number;start:Point;latest:Point}|null>(null);
 useEffect(()=>{if(disabled||!editing){drag.current=null;setDraft(null);}},[disabled,editing]);
 function coords(e:PointerEvent<SVGGElement>){const svg=e.currentTarget.ownerSVGElement!,matrix=svg.getScreenCTM();if(!matrix)return null;return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());}
 function cancel(){drag.current=null;setDraft(null);}
 function down(e:PointerEvent<SVGGElement>){if(!editing||disabled||e.button!==0||drag.current)return;const p=coords(e);if(!p)return;e.stopPropagation();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,x:p.x,y:p.y,start:point,latest:point};}
 function move(e:PointerEvent<SVGGElement>){const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const p=coords(e);if(!p)return;const start=project(d.start);d.latest=unproject(start.x+p.x-d.x,start.y+p.y-d.y);setDraft(d.latest);}
 function up(e:PointerEvent<SVGGElement>){const d=drag.current;if(!d||d.pointer!==e.pointerId)return;move(e);const p=d.latest;cancel();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);onMove(id,p);}
 const bounds={armchair:[85,610,400,395],chair:[1060,580,170,240],sofa:[1210,610,690,335],"table-chair":[990,750,910,290]}[id];
 return <g data-furniture={id} transform={transformFurniture(id,draft??point)} className={editing?styles.movable:undefined} role={editing?"button":undefined} aria-label={editing?`移动${furniture[id].name}`:undefined} aria-disabled={editing?disabled:undefined} tabIndex={editing&&!disabled?0:undefined}
 onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
 onKeyDown={e=>{if(!editing||disabled)return;if(e.key==="Escape"){cancel();return;}const delta={ArrowLeft:[-.012,0],ArrowRight:[.012,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]}[e.key];if(delta){e.preventDefault();onMove(id,{u:point.u+delta[0],v:point.v+delta[1]});}}}>
 {children}{editing&&<rect className={styles.moveHandle} x={bounds[0]} y={bounds[1]} width={bounds[2]} height={bounds[3]} rx="12"/>}
 </g>;
}
