import {readSession,type Session as Auth} from "../l1/api";
import {type Action,type State,type Decision,initialState} from "./model";

export type ServerAction = Action;
export type Session = {id:string;version:number;source:"server_database";rules_version:string;
 state:{segment:"storm"|"carry";choices:Record<Decision,boolean|null>;carry:boolean|null;draft:State["draft"];item:State["item"];completion:string;events:{id:string;at:string;action:ServerAction}[]}};
export type Pending = {sessionId:string;action_id:string;expected_version:number;action:ServerAction};
export type Receipt = {action_id:string;received_at:string;action:ServerAction;accepted:boolean;code:string;previous_version:number;version:number;state_changed:boolean;rules_version:string;validation_version:string;authority:{record_source:string;decision_source:string};outcome:unknown;scoring:unknown};
export const pendingKey=(id:string)=>`emotional:l3:pending:${id}`;
export const changeKey=(id:string)=>`emotional:l3:revision:${id}`;
export class RejectedAction extends Error {constructor(public session:Session,public code:string){super(code);}}
export function credentials():Auth {
 const auth=readSession();
 if(!auth?.id||!auth.token)throw Error("请先完成第一、二幕，再进入第三幕。原旅程凭据未找到。");
 return auth;
}
export function assertCurrent(auth:Auth){const now=credentials();if(now.id!==auth.id||now.token!==auth.token)throw Error("旅程已切换，请重新载入。");}
async function request(auth:Auth,suffix:string,body?:unknown){
 assertCurrent(auth);
 const response=await fetch(`/api/v1/sessions/${auth.id}/levels/l3${suffix}`,{method:body===undefined?"GET":"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:`Bearer ${auth.token}`},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const data=await response.json();assertCurrent(auth);
 if(!response.ok&&!data.session){
  const messages:Record<string,string>={L1_NOT_COMPLETE:"第一幕尚未完成，请返回继续。",L2_NOT_COMPLETE:"第二幕尚未通关，请先整理家具并确认。",SESSION_NOT_FOUND:"原旅程凭据已失效，请返回第一幕。"};
  throw Error(messages[data.detail]|| (typeof data.detail==="string"?data.detail:`服务器暂不可用（${response.status}），请重试。`));
 }
 return data;
}
export async function start(auth:Auth):Promise<Session>{return request(auth,"",{});}
export async function getReceipts(auth:Auth):Promise<Receipt[]>{return request(auth,"/events");}
export function toView(session:Session):State {
 const s=session.state;
 return {...initialState(s.segment),choices:{...s.choices},carry:s.carry,draft:s.draft,item:s.item,events:s.events};
}
export function readPending(id:string):Pending|null {
 const raw=localStorage.getItem(pendingKey(id));if(!raw)return null;
 const p=JSON.parse(raw) as Pending;
 if(p.sessionId!==id||typeof p.action_id!=="string"||!Number.isInteger(p.expected_version)||!p.action)throw Error("待同步记录无法读取，原记录已保留。");
 return p;
}
export function prepare(session:Session,action:Action):Pending {
 if(readPending(session.id))throw Error("仍有待确认动作，请先重试同步。");
 const p={sessionId:session.id,action_id:crypto.randomUUID(),expected_version:session.version,action};
 localStorage.setItem(pendingKey(session.id),JSON.stringify(p));return p;
}
export async function submit(auth:Auth,p:Pending):Promise<Session>{
 if(auth.id!==p.sessionId)throw Error("待同步动作属于另一段旅程。");
 const {sessionId:_,...body}=p;const result=await request(auth,"/actions",body);
 if(result.session?.id!==auth.id||result.session?.source!=="server_database"||typeof result.accepted!=="boolean")throw Error("服务器响应无效，待同步动作已保留。");
 localStorage.setItem(changeKey(auth.id),JSON.stringify({version:result.session.version,action_id:p.action_id}));
 if(readPending(auth.id)?.action_id===p.action_id)localStorage.removeItem(pendingKey(auth.id));
 if(!result.accepted)throw new RejectedAction(result.session,result.code);
 return result.session;
}
// Serialize pending read/write across tabs on supported secure browser contexts.
// Server expected_version remains authoritative even without Web Locks.
export async function withSessionLock<T>(id:string,work:()=>Promise<T>):Promise<T>{
 if(typeof navigator!=="undefined"&&navigator.locks)return navigator.locks.request(`emotional:l3:${id}`,work);
 return work();
}
