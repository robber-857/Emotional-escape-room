import {initialLayout,moveLayout,furnitureIds,type Layout,type FurnitureId,type Point} from "./layout";
import {measureLayout,movementTolerance,countVersion} from "./metrics";
export const seats = ["chair", "table-seat"] as const;
export type Seat = typeof seats[number];
export type KeyId = "key-1" | "key-2";
export type Action = {type:"layout-start"}|{type:"layout-move";id:FurnitureId;point:Point}|{type:"layout-undo"}|{type:"layout-reset"}|{type:"layout-exit"}|{type:"layout-confirm"}| {type:"search-choice";yes:boolean} | {type:"search-time";activeMs:number} | {type:"curtain-click"} | {type:"find-earring"} | { type: "explore"; yes: boolean } | { type: "return-hall" } | { type: "view"; view: "room" | "table" } | { type: "try-door"; key: KeyId } | { type: "arrive-table" } | { type: "sit"; seat: Seat; yes: boolean } | { type: "select-key"; key: KeyId };
export type Event = { id: string; at: string; action: Action };
export type State = { exitDoorOpen:boolean; furniture:{baseline:Layout;triggered:{tidy:boolean;openPlacement:boolean};editing:boolean;layout:Layout;history:Layout[];confirmed:Layout|null;classification:ReturnType<typeof measureLayout>|null;adjustmentCount:number|null;countVersion:string}; search: {curtainClicks:number;status:"idle"|"declined"|"searching"|"returned"|"found";activeMs:number;long:boolean}; view: "room" | "table" | "bedroom"; attempts: KeyId[]; doorOpen: boolean; atTable: boolean; seat: Seat | null; keys: KeyId[]; selectedKey: KeyId | null; events: Event[] };
export const SAVE_KEY = "emotional:l2:preview:v2";
export const MAX_EVENTS = 1000;
export const initialState = (): State => ({ exitDoorOpen:false, furniture:{baseline:initialLayout(),triggered:{tidy:false,openPlacement:false},editing:false,layout:initialLayout(),history:[],confirmed:null,classification:null,adjustmentCount:0,countVersion},search:{curtainClicks:0,status:"idle",activeMs:0,long:false}, view: "room", attempts: [], doorOpen: false, atTable: false, seat: null, keys: [], selectedKey: null, events: [] });
export const keysAvailable = (s: State) => s.atTable || s.seat === "table-seat";
export const seatNames: Record<Seat, string> = {chair:"窗边椅","table-seat":"桌前椅"};
export const keyNames: Record<KeyId, string> = {"key-1":"钥匙1","key-2":"钥匙2"};
export function transition(s: State, event: Event): State {
 if (s.events.length >= MAX_EVENTS || s.events.some(e=>e.id===event.id)) return s;
 const a=event.action;
 if(a.type==="layout-confirm"&&measureLayout(s.furniture.layout,s.furniture.adjustmentCount).evidence.outsideFloor.length)return s;
 if(a.type.startsWith("layout-")&&s.view!=="room")return s;
 if(s.furniture.editing&&!a.type.startsWith("layout-"))return s;
 if(a.type.startsWith("layout-")&&a.type!=="layout-start"&&!s.furniture.editing)return s;
 if(a.type==="layout-start"&&s.furniture.editing)return s;
 if(a.type==="layout-undo"&&!s.furniture.history.length)return s;
 if(a.type==="layout-reset"&&JSON.stringify(s.furniture.layout)===JSON.stringify(initialLayout()))return s;
 if(a.type==="layout-move"&&(!furnitureIds.includes(a.id)||!moveLayout(s.furniture.layout,a.id,a.point)||Math.hypot(s.furniture.layout[a.id].u-a.point.u,s.furniture.layout[a.id].v-a.point.v)<movementTolerance))return s;
 if(a.type==="explore" && (!s.doorOpen || s.view!=="room")) return s;
 if(a.type==="return-hall" && s.view!=="bedroom") return s;
 if(s.view==="bedroom" && !["return-hall","search-choice","search-time","find-earring","curtain-click"].includes(a.type)) return s;
 if(a.type==="sit" && !seats.includes(a.seat)) return s;
 if (a.type === "select-key" && (!keysAvailable(s) || s.selectedKey===a.key)) return s;
 if (a.type === "arrive-table" && s.atTable) return s;
 if(a.type === "try-door" && (s.doorOpen || !s.keys.includes(a.key) || s.attempts.includes(a.key))) return s;
 if(a.type === "view" && (a.view===s.view || (a.view==="table" && !keysAvailable(s)))) return s;
 if(["search-choice","search-time","find-earring","curtain-click"].includes(a.type) && s.view!=="bedroom")return s;
 if(a.type==="search-choice" && ["searching","found"].includes(s.search.status))return s;
 if(a.type==="search-time" && (s.search.status!=="searching" || !Number.isSafeInteger(a.activeMs) || a.activeMs<=s.search.activeMs))return s;
 if(a.type==="find-earring")return s; // Legacy replay only; no direct pickup in the current rules.
 if(a.type==="curtain-click" && (s.search.status!=="searching"||s.search.curtainClicks>=3))return s;
 const next={...s,events:[...s.events,event]};
 if(a.type==="layout-start")return {...next,furniture:{...s.furniture,editing:true}};
 if(a.type==="layout-exit")return {...next,furniture:{...s.furniture,editing:false}};
 if(a.type==="layout-confirm"){
  const classification=measureLayout(s.furniture.layout,s.furniture.adjustmentCount);
  return {...next,exitDoorOpen:true,furniture:{...s.furniture,editing:false,confirmed:s.furniture.layout,baseline:s.furniture.layout,classification}};
 }
 const adjustmentCount=s.furniture.adjustmentCount===null?null:s.furniture.adjustmentCount+1;
 if(a.type==="layout-undo")return {...next,furniture:{...s.furniture,adjustmentCount,layout:s.furniture.history.at(-1)!,history:s.furniture.history.slice(0,-1),confirmed:null,classification:null}};
 if(a.type==="layout-reset"||a.type==="layout-move")return {...next,furniture:{...s.furniture,adjustmentCount,layout:a.type==="layout-reset"?initialLayout():moveLayout(s.furniture.layout,a.id,a.point)!,history:[...s.furniture.history.slice(-49),s.furniture.layout],confirmed:null,classification:null}};
 if(a.type==="search-choice")return {...next,search:{curtainClicks:s.search.curtainClicks,status:a.yes?"searching":"declined",activeMs:0,long:false}};
 if(a.type==="search-time")return {...next,search:{...s.search,activeMs:a.activeMs,long:a.activeMs>15000}};
 if(a.type==="curtain-click")return {...next,search:{...s.search,curtainClicks:s.search.curtainClicks+1,status:s.search.curtainClicks===2?"found":"searching"}};
 if(a.type==="explore") return {...next,view:a.yes?"bedroom":"room"};
 if(a.type==="return-hall") return {...next,view:"room",search:s.search.status==="searching"?{...s.search,status:"returned"}:s.search};
 if(a.type === "view") return {...next,view:a.view};
 if(a.type === "try-door") return {...next,view:"room",attempts:[...s.attempts,a.key],doorOpen:s.attempts.length===1};
 if (a.type === "arrive-table") return {...next,atTable:true};
 if (a.type === "sit") return a.yes ? {...next,seat:a.seat,atTable:s.atTable||a.seat==="table-seat",view:a.seat==="table-seat"?"table":s.view} : next;
 return {...next,selectedKey:a.key,keys:s.keys.includes(a.key)?s.keys:[...s.keys,a.key]};
}
export function restore(raw: string): State {
 const data=JSON.parse(raw);
 if(data?.version!==1 || !Array.isArray(data.events) || data.events.length>MAX_EVENTS) throw new Error("存档格式无效");
 let state=initialState();
 for(const e of data.events){
  if(!e || typeof e.id!=="string" || !e.id || typeof e.at!=="string" || !Number.isFinite(Date.parse(e.at))) throw new Error("存档事件无效");
  const a=e.action;
  if(!a || !(a.type==="arrive-table" || ["layout-start","layout-undo","layout-reset","layout-exit","layout-confirm"].includes(a.type) || (a.type==="layout-move" && furnitureIds.includes(a.id) && a.point && Number.isFinite(a.point.u) && Number.isFinite(a.point.v)) || (a.type==="search-choice" && typeof a.yes==="boolean") || (a.type==="search-time" && Number.isSafeInteger(a.activeMs) && a.activeMs>=0) || a.type==="find-earring" || a.type==="curtain-click" || (a.type==="explore" && typeof a.yes==="boolean") || a.type==="return-hall" || (a.type==="view" && ["room","table"].includes(a.view)) || (a.type==="try-door" && ["key-1","key-2"].includes(a.key)) || (a.type==="sit" && seats.includes(a.seat) && typeof a.yes==="boolean") || (a.type==="select-key" && ["key-1","key-2"].includes(a.key)))) throw new Error("未知动作");
  // Preserve completed pre-curtain saves without treating a direct pickup as a new valid action.
  if(a.type==="find-earring" && state.view==="bedroom" && state.search.status==="searching" && !state.events.some(x=>x.id===e.id)){state={...state,search:{...state.search,status:"found",curtainClicks:3},events:[...state.events,e]};continue;}
  const next=transition(state,e);if(next===state)throw new Error("存档顺序无效");state=next;
 }
 return state;
}
