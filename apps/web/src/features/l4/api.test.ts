import test from "node:test";
import assert from "node:assert/strict";
import {SESSION_KEY} from "../l1/api";
import {initialState} from "../l1/model";
import {prepare,submit,start,readPending,pendingKey,RejectedAction,type Session} from "./api";

const auth={id:"original",token:"test-token",version:4,rules_version:"l1",state:initialState(),positions:{}};
const saved:Session={id:auth.id,level:"l4",source:"server_database",version:0,rules_version:"l4-flow-v1",state:{door:null,item:"lantern",completion:"in_progress",events:[]}};
const complete:Session={...saved,version:1,state:{...saved.state,door:"forest",completion:"complete"}};
function storage(){const values=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});localStorage.setItem(SESSION_KEY,JSON.stringify(auth));}

test("lost response retries the same durable ID, never imports preview or changes L1 credentials",async()=>{
  storage();const original=globalThis.fetch;
  try{
    localStorage.setItem("emotional:l4:preview:v1:original",JSON.stringify({door:"castle"}));
    const p=prepare(saved,{type:"confirm",door:"forest"});
    globalThis.fetch=async()=>{throw Error("response lost");};
    await assert.rejects(submit(auth,p));assert.deepEqual(readPending(auth.id),p);
    assert.throws(()=>prepare(saved,{type:"confirm",door:"castle"}));
    globalThis.fetch=async(url,init)=>{assert.match(String(url),/original\/levels\/l4\/actions$/);assert.deepEqual(JSON.parse(init!.body as string),{action_id:p.action_id,expected_version:0,action:{type:"confirm",door:"forest"}});return Response.json({accepted:true,duplicate:true,session:complete});};
    assert.equal((await submit(auth,readPending(auth.id)!)).state.door,"forest");
    assert.equal(readPending(auth.id),null);assert.deepEqual(JSON.parse(localStorage.getItem(SESSION_KEY)!),auth);
  }finally{globalThis.fetch=original;}
});
test("conflict adopts server state without erasing a newer pending request",async()=>{
  storage();const original=globalThis.fetch;
  try{
    const p=prepare(saved,{type:"confirm",door:"forest"}),newer={...p,action_id:"newer"};
    globalThis.fetch=async()=>{localStorage.setItem(pendingKey(auth.id),JSON.stringify(newer));return Response.json({accepted:false,code:"VERSION_CONFLICT",session:complete},{status:409});};
    await assert.rejects(submit(auth,p),e=>e instanceof RejectedAction&&e.session.state.door==="forest");
    assert.deepEqual(readPending(auth.id),newer);
  }finally{globalThis.fetch=original;}
});
test("late response after journey switch retains the original pending request",async()=>{
  storage();const original=globalThis.fetch;
  try{
    const p=prepare(saved,{type:"confirm",door:"forest"});
    globalThis.fetch=async()=>{localStorage.setItem(SESSION_KEY,JSON.stringify({...auth,id:"other"}));return Response.json({accepted:true,session:complete});};
    await assert.rejects(submit(auth,p),/旅程已切换/);assert.deepEqual(readPending(auth.id),p);
  }finally{globalThis.fetch=original;}
});
test("malformed responses and storage failures preserve retry data",async()=>{
  storage();const original=globalThis.fetch,set=localStorage.setItem;
  try{
    const p=prepare(saved,{type:"confirm",door:"forest"});
    globalThis.fetch=async()=>Response.json({accepted:true,session:{...complete,state:{...complete.state,door:"forged"}}});
    await assert.rejects(submit(auth,p),/响应无效/);assert.deepEqual(readPending(auth.id),p);
    globalThis.fetch=async()=>Response.json({accepted:true,session:complete});
    localStorage.setItem=()=>{throw Error("storage denied");};
    await assert.rejects(submit(auth,p),/storage denied/);assert.deepEqual(readPending(auth.id),p);
    localStorage.setItem=set;await submit(auth,p);assert.equal(readPending(auth.id),null);
  }finally{globalThis.fetch=original;localStorage.setItem=set;}
});
test("start sends no local preview or supplied inventory data",async()=>{
  storage();const original=globalThis.fetch;
  try{
    globalThis.fetch=async(_,init)=>{assert.equal(init!.body,"{}");return Response.json(saved);};
    assert.equal((await start(auth)).state.item,"lantern");
  }finally{globalThis.fetch=original;}
});
