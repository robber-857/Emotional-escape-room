import test from "node:test";
import assert from "node:assert/strict";
import {initialState} from "./model";
import {prepare,submit,readPending,pendingKey,RejectedAction,type Session} from "./api";
import {initialState as l1Initial} from "../l1/model";
const session:Session={id:"test",version:0,rules_version:"l2-rules-v1",state:initialState(),l1:{version:2,scene:"complete",route:"swim",lampTaken:false,lampLit:false},scoring:{status:"pending_configuration",totals:null}};
const auth={id:"test",token:"test-token",version:2,rules_version:"l1-rules-v1",state:l1Initial(),positions:{}};
function storage(){const values=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});}
test("L2 lost responses keep the original request, resume is scoped to the L1 session",async()=>{
 storage();const old=globalThis.fetch;
 try{const pending=prepare(session,{type:"arrive-table"});globalThis.fetch=async()=>{throw new Error("response lost");};
 await assert.rejects(submit(auth,pending));assert.deepEqual(readPending(session.id),pending);assert.throws(()=>prepare(session,{type:"layout-start"}));
 await assert.rejects(submit({...auth,id:"other"},pending));assert.equal(readPending("other"),null);
 globalThis.fetch=async(url,init)=>{assert.match(String(url),/sessions\/test\/levels\/l2\/actions$/);assert.equal(JSON.parse(init!.body as string).action_id,pending.action_id);return Response.json({accepted:true,session:{...session,version:1},duplicate:true});};
 assert.equal((await submit(auth,readPending(session.id)!)).version,1);assert.equal(readPending(session.id),null);
 }finally{globalThis.fetch=old;}
});
test("L2 rejection adopts server state and clears only this session's pending action",async()=>{
 storage();const old=globalThis.fetch;localStorage.setItem(pendingKey("other"),'keep');
 try{const p=prepare(session,{type:"layout-start"});globalThis.fetch=async()=>Response.json({accepted:false,code:"VERSION_CONFLICT",session:{...session,version:3}},{status:409});
 await assert.rejects(submit(auth,p),error=>error instanceof RejectedAction&&error.session.version===3);assert.equal(readPending(session.id),null);assert.equal(localStorage.getItem(pendingKey("other")),"keep");
 }finally{globalThis.fetch=old;}
});

test("a late receipt cannot remove another tab's newer pending request",async()=>{
 storage();const old=globalThis.fetch;
 try{const p=prepare(session,{type:"arrive-table"});const newer={...p,action_id:"another-action"};
 globalThis.fetch=async()=>{localStorage.setItem(pendingKey(session.id),JSON.stringify(newer));return Response.json({accepted:true,session:{...session,version:1}});};
 await submit(auth,p);assert.deepEqual(readPending(session.id),newer);
 }finally{globalThis.fetch=old;}
});
