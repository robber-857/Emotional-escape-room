import test from "node:test";
import assert from "node:assert/strict";
import { initialState, transition, restore, keysAvailable, seats, type Action, type State } from "./model";
let index=0;
const event=(action:Action)=>({id:`event-${++index}`,at:"2026-09-28T00:00:00Z",action});
const act=(s:State,a:Action)=>transition(s,event(a));
const save=(s:State)=>JSON.stringify({version:1,events:s.events});
test("arriving at the table alone unlocks key choice without choosing a seat or key",()=>{
 const s=act(initialState(),{type:"arrive-table"});assert.equal(keysAvailable(s),true);assert.equal(s.seat,null);assert.deepEqual(s.keys,[]);assert.equal(s.selectedKey,null);
});
test("only table seat unlocks keys; window chair does not",()=>{
 for(const seat of seats){const s=act(initialState(),{type:"sit",seat,yes:true});assert.equal(s.seat,seat);assert.equal(s.atTable,seat==="table-seat");assert.equal(keysAvailable(s),seat==="table-seat");assert.deepEqual(s.keys,[]);}
});
test("declining a seat does not unlock keys or stop a later table visit",()=>{
 const no=act(initialState(),{type:"sit",seat:"chair",yes:false});assert.equal(keysAvailable(no),false);assert.equal(no.events.length,1);assert.equal(keysAvailable(act(no,{type:"arrive-table"})),true);
});
test("key choice before either trigger is rejected",()=>{
 const s=initialState();assert.equal(act(s,{type:"select-key",key:"key-1"}),s);
});
test("key selections are explicit, independent, and repeated selection does not duplicate inventory",()=>{
 let s=act(initialState(),{type:"arrive-table"});s=act(s,{type:"select-key",key:"key-2"});assert.deepEqual(s.keys,["key-2"]);assert.equal(act(s,{type:"select-key",key:"key-2"}),s);
 s=act(s,{type:"select-key",key:"key-1"});assert.deepEqual(s.keys,["key-2","key-1"]);assert.equal(s.selectedKey,"key-1");
 const e=event({type:"select-key",key:"key-2"});s=transition(s,e);assert.equal(transition(s,e),s);
});
test("refresh replays the existing decisions without inventing new events",()=>{
 let s=act(initialState(),{type:"sit",seat:"table-seat",yes:true});s=act(s,{type:"select-key",key:"key-1"});assert.deepEqual(restore(save(s)),s);
});
test("restore rejects invalid, out-of-order, and duplicate journals",()=>{
 assert.throws(()=>restore('{'));assert.throws(()=>restore(JSON.stringify({version:2,events:[]})));
 assert.throws(()=>restore(JSON.stringify({version:1,events:[event({type:"select-key",key:"key-1"})]})));
 const e=event({type:"arrive-table"});assert.throws(()=>restore(JSON.stringify({version:1,events:[e,e]})));
 assert.throws(()=>restore(JSON.stringify({version:1,events:[{...e,action:{type:"sit",seat:"ceiling",yes:true}}]})));
});

test("table seat switches perspective and declines do not",()=>{
 assert.equal(act(initialState(),{type:"sit",seat:"table-seat",yes:false}).view,"room");
 const s=act(initialState(),{type:"sit",seat:"table-seat",yes:true});assert.equal(s.view,"table");assert.deepEqual(restore(save(s)),s);
});
test("either first key fails, only the other owned key succeeds, attempts survive refresh",()=>{
 for(const first of ["key-1","key-2"] as const){const other=first==="key-1"?"key-2":"key-1";
 let s=act(initialState(),{type:"arrive-table"});assert.equal(act(s,{type:"try-door",key:first}),s);
 s=act(s,{type:"select-key",key:first});s=act(s,{type:"try-door",key:first});assert.equal(s.doorOpen,false);assert.deepEqual(s.attempts,[first]);s=restore(save(s));
 assert.equal(act(s,{type:"try-door",key:first}),s);assert.equal(act(s,{type:"try-door",key:other}),s);
 s=act(s,{type:"view",view:"table"});s=act(s,{type:"select-key",key:other});s=act(s,{type:"try-door",key:other});assert.equal(s.doorOpen,true);assert.deepEqual(s.attempts,[first,other]);assert.equal(act(s,{type:"try-door",key:other}),s);assert.deepEqual(restore(save(s)),s);
 }
});
test("collecting both keys or changing selection never counts as opening the door",()=>{
 let s=act(initialState(),{type:"arrive-table"});s=act(s,{type:"select-key",key:"key-1"});s=act(s,{type:"select-key",key:"key-2"});assert.deepEqual(s.attempts,[]);assert.equal(s.doorOpen,false);
 s=act(s,{type:"try-door",key:"key-2"});assert.equal(s.doorOpen,false);s=act(s,{type:"try-door",key:"key-1"});assert.equal(s.doorOpen,true);
});

test("window chair cannot grant table access or keys",()=>{const s=act(initialState(),{type:"sit",seat:"chair",yes:true});assert.equal(s.view,"room");assert.equal(act(s,{type:"select-key",key:"key-1"}),s);assert.equal(act(s,{type:"view",view:"table"}),s);});
test("sofas are rejected even for a forged runtime action",()=>{for(const seat of ["sofa","armchair"]){const s=initialState();assert.equal(act(s,{type:"sit",seat,yes:true} as Action),s);}});

test("exploration requires unlocking; decline, enter, return and refresh preserve evidence",()=>{
 let s=initialState();assert.equal(act(s,{type:"explore",yes:true}),s);assert.equal(act(s,{type:"return-hall"}),s);
 s=act(s,{type:"arrive-table"});for(const key of ["key-1","key-2"] as const){s=act(s,{type:"select-key",key});s=act(s,{type:"try-door",key});}
 s=act(s,{type:"explore",yes:false});assert.equal(s.view,"room");assert.equal(s.doorOpen,true);s=restore(save(s));
 s=act(s,{type:"explore",yes:true});assert.equal(s.view,"bedroom");assert.deepEqual(restore(save(s)),s);
 assert.equal(act(s,{type:"explore",yes:true}),s);assert.equal(act(s,{type:"view",view:"table"}),s);assert.equal(act(s,{type:"sit",seat:"chair",yes:true}),s);
 s=act(s,{type:"return-hall"});assert.equal(s.view,"room");assert.equal(s.doorOpen,true);assert.equal(s.attempts.length,2);assert.equal(act(s,{type:"explore",yes:true}).view,"bedroom");
});
