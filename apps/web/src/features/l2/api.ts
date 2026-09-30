import {readSession,type Session as L1Session} from "../l1/api";
import type {Action,State} from "./model";
export type Session={id:string;version:number;rules_version:string;state:State;l1:{version:number;scene:string;route:string;lampTaken:boolean;lampLit:boolean};scoring:{status:"pending_configuration";totals:null}};
export type Pending={sessionId:string;action_id:string;expected_version:number;action:Action};
export type Receipt={score_effect?:unknown;action_id:string;received_at:string;accepted:boolean;code:string;version:number;previous_version?:number;rules_version:string;validation_version?:string;action:Action;authority:{record_source:"server_database";decision_source:"server";input_source:"client_claim"};outcome?:Record<string,unknown>|null;scoring:{status:string;policy_version:string|null;contributions:unknown;facts:Record<string,unknown>}|null};
export const pendingKey=(id:string)=>`emotional:l2:pending:${id}`;
export const changeKey=(id:string)=>`emotional:l2:revision:${id}`;
export class RejectedAction extends Error{constructor(public session:Session,public code:string){super(code);}}
export function credentials():L1Session{
 const session=readSession();
 if(!session?.id||!session.token)throw new Error("请先完成第一幕，再进入第二幕。");
 return session;
}
async function request(auth:L1Session,suffix:string,body?:unknown){
 const response=await fetch(`/api/v1/sessions/${auth.id}/levels/l2${suffix}`,{method:body===undefined?"GET":"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:`Bearer ${auth.token}`},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const data=await response.json();
 if(!response.ok&&!data.session)throw new Error(data.detail==="L1_NOT_COMPLETE"?"第一幕尚未完成，请返回继续。":data.detail==="SESSION_NOT_FOUND"?"原旅程的凭据已失效，请返回第一幕。":typeof data.detail==="string"?data.detail:`HTTP ${response.status}`);
 return data;
}
export async function start(auth:L1Session):Promise<Session>{return request(auth,"",{});}
export async function getReceipts(auth:L1Session):Promise<Receipt[]>{return request(auth,"/events");}
export function readPending(id:string):Pending|null{const raw=localStorage.getItem(pendingKey(id));return raw?JSON.parse(raw):null;}
export function prepare(session:Session,action:Action):Pending{
 if(readPending(session.id))throw new Error("仍有待确认动作，请先重试同步。");
 const pending={sessionId:session.id,action_id:crypto.randomUUID(),expected_version:session.version,action};
 localStorage.setItem(pendingKey(session.id),JSON.stringify(pending));return pending;
}
export async function submit(auth:L1Session,pending:Pending):Promise<Session>{
 if(pending.sessionId!==auth.id)throw new Error("待同步动作属于另一段旅程。");
 const {sessionId:_,...body}=pending;const result=await request(auth,"/actions",body);
 // Notify other tabs only after receiving an authoritative snapshot. Pending stays if storage fails.
 localStorage.setItem(changeKey(auth.id),JSON.stringify({version:result.session.version,action_id:pending.action_id}));
 // A response from an older request must not erase a different pending request from another tab.
 const stored=readPending(auth.id);
 if(stored?.action_id===pending.action_id)localStorage.removeItem(pendingKey(auth.id));
 if(!result.accepted)throw new RejectedAction(result.session,result.code);
 return result.session;
}
