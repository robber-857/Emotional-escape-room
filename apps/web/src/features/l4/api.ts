import {readSession,type Session as Auth} from "../l1/api";
import {items,type Item} from "../l3/model";

export const doorIds=["village","coast","forest","castle"] as const;
export type DoorId=typeof doorIds[number];
export type Action={type:"confirm";door:DoorId};
export type Session={id:string;level:"l4";source:"server_database";version:number;rules_version:string;
  state:{door:DoorId|null;item:Item|null;completion:"in_progress"|"complete";events:{id:string;at:string;action:Action}[]}};
export type Pending={sessionId:string;action_id:string;expected_version:number;action:Action};
export type Receipt={action_id:string;received_at:string;accepted:boolean;code:string;action:Action;previous_version:number;version:number;state_changed:boolean;
  authority:{record_source:string;decision_source:string;input_source:string};
  validation:{source:string;authenticated:boolean;l1_complete:boolean;l2_complete:boolean;l3_complete:boolean;rules_supported:boolean;expected_version:number;actual_version:number;version_matches:boolean;flow_evaluated:boolean;flow_allowed:boolean|null};
  rules_version:string;validation_version:string;outcome:unknown;scoring:unknown};
export const pendingKey=(id:string)=>`emotional:l4:pending:${id}`;
export const changeKey=(id:string)=>`emotional:l4:revision:${id}`;
export class RejectedAction extends Error{constructor(public session:Session,public code:string){super(code);}}
export function credentials():Auth{
  const auth=readSession();
  if(!auth?.id||!auth.token)throw Error("请先完成前三幕，再进入第四幕。原旅程凭据未找到。");
  return auth;
}
export function assertCurrent(auth:Auth){const now=credentials();if(now.id!==auth.id||now.token!==auth.token)throw Error("旅程已切换，请重新载入。");}
function validSession(value:unknown,id:string):value is Session{
  if(!value||typeof value!=="object")return false;
  const s=value as Session;
  return s.id===id&&s.level==="l4"&&s.source==="server_database"&&Number.isInteger(s.version)&&s.version>=0
    &&typeof s.rules_version==="string"&&!!s.state&&Array.isArray(s.state.events)
    &&(s.state.item===null||Object.hasOwn(items,s.state.item))
    &&((s.state.completion==="in_progress"&&s.state.door===null)||(s.state.completion==="complete"&&doorIds.includes(s.state.door as DoorId)));
}
async function request(auth:Auth,suffix:string,body?:unknown){
  assertCurrent(auth);
  const response=await fetch(`/api/v1/sessions/${auth.id}/levels/l4${suffix}`,{method:body===undefined?"GET":"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${auth.token}`},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await response.json();assertCurrent(auth);
  if(!response.ok&&!data.session){
    const messages:Record<string,string>={L1_NOT_COMPLETE:"请先完成第一幕。",L2_NOT_COMPLETE:"请先完成第二幕。",L3_NOT_COMPLETE:"请先在第三幕确认携带物品，或选择不带物品。",SESSION_NOT_FOUND:"原旅程凭据已失效，请返回第一幕。",DATABASE_UNAVAILABLE:"服务器暂不可用，请重试同步。"};
    throw Error(messages[data.detail]||`服务器未能处理请求（${response.status}），请重试同步。`);
  }
  return data;
}
export async function start(auth:Auth):Promise<Session>{const data=await request(auth,"",{});if(!validSession(data,auth.id))throw Error("服务器存档响应无效，请重试同步。");return data;}
export async function getReceipts(auth:Auth):Promise<Receipt[]>{const data=await request(auth,"/events");if(!Array.isArray(data))throw Error("服务器回执格式无效。");return data;}
export function readPending(id:string):Pending|null{
  const raw=localStorage.getItem(pendingKey(id));if(!raw)return null;
  const p=JSON.parse(raw) as Pending;
  if(p.sessionId!==id||typeof p.action_id!=="string"||!Number.isInteger(p.expected_version)||p.expected_version<0||p.action?.type!=="confirm"||!doorIds.includes(p.action.door))throw Error("待同步记录无法读取，原记录已保留。");
  return p;
}
export function prepare(session:Session,action:Action):Pending{
  if(readPending(session.id))throw Error("仍有待确认动作，请先重试同步。");
  const pending={sessionId:session.id,action_id:crypto.randomUUID(),expected_version:session.version,action};
  localStorage.setItem(pendingKey(session.id),JSON.stringify(pending));return pending;
}
export async function submit(auth:Auth,p:Pending):Promise<Session>{
  if(p.sessionId!==auth.id)throw Error("待同步动作属于另一段旅程。");
  const {sessionId:_,...body}=p,result=await request(auth,"/actions",body);
  if(!validSession(result.session,auth.id)||typeof result.accepted!=="boolean")throw Error("服务器响应无效，待同步动作已保留。");
  localStorage.setItem(changeKey(auth.id),JSON.stringify({version:result.session.version,action_id:p.action_id}));
  if(readPending(auth.id)?.action_id===p.action_id)localStorage.removeItem(pendingKey(auth.id));
  if(!result.accepted)throw new RejectedAction(result.session,result.code);
  return result.session;
}
export async function withSessionLock<T>(id:string,work:()=>Promise<T>):Promise<T>{
  if(typeof navigator!=="undefined"&&navigator.locks)return navigator.locks.request(`emotional:l4:${id}`,work);
  return work();
}
