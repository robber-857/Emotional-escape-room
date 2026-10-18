import test from "node:test";
import assert from "node:assert/strict";
import {reliableJson,SyncUnavailable} from "../shared/reliableRequest";

test("a lost response retries the identical serialized operation",async()=>{
 const original=globalThis.fetch;const calls:RequestInit[]=[];
 const body=JSON.stringify({action_id:"same-id",expected_version:7,action:{type:"layout-move"}});
 try{
  globalThis.fetch=async(_url,init)=>{calls.push(init!);if(calls.length===1)throw new TypeError("Failed to fetch");return Response.json({accepted:true,duplicate:true});};
  const {data}=await reliableJson("/actions",{method:"POST",body},{retryDelays:[0]});
  assert.equal(data.duplicate,true);assert.equal(calls.length,2);
  assert.equal(calls[0].body,body);assert.equal(calls[1].body,body);
  assert.notEqual(calls[0].signal,calls[1].signal);
 }finally{globalThis.fetch=original;}
});
test("transient proxy errors get a bounded retry, not an infinite loop",async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response("Bad gateway",{status:502});};
  await assert.rejects(reliableJson("/actions",{},{retryDelays:[0]}),e=>e instanceof SyncUnavailable&&e.status===502);
  assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
test("auth errors and business conflicts are returned without automatic replay",async()=>{
 const original=globalThis.fetch;
 try{for(const status of [401,403,409,422]){
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({detail:"rejected"},{status});};
  const result=await reliableJson("/actions",{},{retryDelays:[0]});
  assert.equal(result.response.status,status);assert.equal(calls,1);
 }}finally{globalThis.fetch=original;}
});
test("changing journey between attempts cancels replay",async()=>{
 const original=globalThis.fetch;let calls=0;let checks=0;
 try{
  globalThis.fetch=async()=>{calls++;throw new TypeError("Failed to fetch");};
  await assert.rejects(reliableJson("/actions",{},{retryDelays:[0],beforeAttempt:()=>{if(++checks===2)throw Error("journey changed");}}),/journey changed/);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
