import {useRef,type ReactNode} from "react";
// Touch releases activate immediately; suppress only the matching compatibility click.
export function LayoutButton({disabled,onAction,children}:{disabled?:boolean;onAction:()=>void;children:ReactNode}){
 const start=useRef<{x:number;y:number}|null>(null),handled=useRef(false);
 return <button disabled={disabled}
 onPointerDown={e=>{handled.current=false;start.current={x:e.clientX,y:e.clientY};}}
 onPointerCancel={()=>{start.current=null;}}
 onPointerUp={e=>{const p=start.current;start.current=null;if(e.pointerType!=="touch"||disabled||!p||Math.hypot(e.clientX-p.x,e.clientY-p.y)>10)return;const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)return;handled.current=true;onAction();}}
 onClick={e=>{if(e.detail===0||!handled.current)onAction();handled.current=false;}}>{children}</button>;
}
