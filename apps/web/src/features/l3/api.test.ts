import test from "node:test";
import assert from "node:assert/strict";
import {SESSION_KEY} from "../l1/api";
import {initialState as initialL1} from "../l1/model";
import {prepare,submit,readPending,pendingKey,toView,RejectedAction,type Session} from "./api";

const auth={id:"original",token:"test-token",version:4,rules_version:"l1",state:initialL1(),positions:{}};
const session:Session={id:auth.id,version:0,source:"server_database",rules_version:"l3-flow-v1",state:{segment:"storm",choices:{open:null,close:null,wait:null,curtain:null,window:null,television:null},carry:null,draft:null,item:null,completion:"in_progress",events:[]}};
function storage(){const values=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});localStorage.setItem(SESSION_KEY,JSON.stringify(auth));}
test("L3 response loss retains exact request; TV has only one server action",async()=>{
 storage();const fetch=globalThis.fetch;
 try{const p=prepare(session,{type:"decision",slot:"television",yes:true});assert.equal(p.action.type==="decision"&&p.action.slot,"television");
  globalThis.fetch=async()=>{throw Error("response lost");};await assert.rejects(submit(auth,p));assert.deepEqual(readPending(auth.id),p);
  assert.throws(()=>prepare(session,{type:"carry",yes:true}));
  globalThis.fetch=async(url,init)=>{assert.match(String(url),/original\/levels\/l3\/actions$/);assert.equal(JSON.parse(init!.body as string).action_id,p.action_id);return Response.json({accepted:true,duplicate:true,session:{...session,version:1}});};
  assert.equal((await submit(auth,readPending(auth.id)!)).version,1);assert.equal(readPending(auth.id),null);
  assert.deepEqual(JSON.parse(localStorage.getItem(SESSION_KEY)!),auth);
 }finally{globalThis.fetch=fetch;}
});
test("server conflicts adopt authoritative state and retain unrelated pending requests",async()=>{
 storage();const fetch=globalThis.fetch;
 try{const p=prepare(session,{type:"carry",yes:true});const newer={...p,action_id:"newer"};
  globalThis.fetch=async()=>{localStorage.setItem(pendingKey(auth.id),JSON.stringify(newer));return Response.json({accepted:false,code:"VERSION_CONFLICT",session:{...session,version:9}},{status:409});};
  await assert.rejects(submit(auth,p),e=>e instanceof RejectedAction&&e.session.version===9);assert.deepEqual(readPending(auth.id),newer);
 }finally{globalThis.fetch=fetch;}
});
test("late response from a switched journey cannot clear its pending action",async()=>{
 storage();const fetch=globalThis.fetch;
 try{const p=prepare(session,{type:"carry",yes:true});
  globalThis.fetch=async()=>{localStorage.setItem(SESSION_KEY,JSON.stringify({...auth,id:"other"}));return Response.json({accepted:true,session});};
  await assert.rejects(submit(auth,p),/旅程已切换/);assert.deepEqual(readPending(auth.id),p);
 }finally{globalThis.fetch=fetch;}
});
test("server TV and combined history adapt for rendering without changing server records",()=>{
 const saved:Session={...session,state:{...session.state,segment:"carry",choices:{...session.state.choices,television:true},events:[{id:"a",at:"2026-09-29T00:00:00Z",action:{type:"decision",slot:"television",yes:true}}]}};
 const view=toView(saved);assert.equal(view.choices.television,true);assert.equal(view.segment,"carry");assert.equal(view.scoring.contributions,null);
 assert.deepEqual(saved.state.events[0].action,{type:"decision",slot:"television",yes:true});assert.equal(view.events[0].action.type==="decision"&&view.events[0].action.slot,"television");
});

test("storage failure after a committed response preserves the durable request for retry",async()=>{
 storage();const fetch=globalThis.fetch;const set=localStorage.setItem;
 try{const p=prepare(session,{type:"decision",slot:"open",yes:true});
  globalThis.fetch=async()=>Response.json({accepted:true,session:{...session,version:1}});
  localStorage.setItem=()=>{throw Error("storage denied");};
  await assert.rejects(submit(auth,p),/storage denied/);assert.deepEqual(readPending(auth.id),p);
  localStorage.setItem=set;assert.equal((await submit(auth,p)).version,1);assert.equal(readPending(auth.id),null);
 }finally{globalThis.fetch=fetch;localStorage.setItem=set;}
});
