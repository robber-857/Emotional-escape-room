import test from "node:test";
import assert from "node:assert/strict";
import {initialState,stormComplete,transition,isRepeatedDecision,restore,serialize,items,MAX_EVENTS,type Action,type State,type Item} from "./model";
let seq=0;

test("old local power events restore as television and only version 2 is written",()=>{
 const events=["open","close","fan"].map((slot,i)=>({id:`legacy-${i}`,at:"2026-09-29T00:00:00Z",action:{type:"decision",slot,yes:true}}));
 const raw=JSON.stringify({version:1,source:"local_preview",segment:"storm",events});
 const restored=restore(raw,"storm");assert.equal(restored.choices.television,true);
 assert.equal(Object.hasOwn(restored.choices,"fan"),false);
 const saved=JSON.parse(serialize(restored));assert.equal(saved.version,2);
 assert.equal(saved.events[2].action.slot,"television");assert.equal(saved.events[2].id,"legacy-2");
 assert.throws(()=>restore(JSON.stringify({version:2,source:"local_preview",segment:"storm",events}),"storm"));
 assert.deepEqual(restore(serialize(restored),"storm"),restored);
});
const act=(s:State,action:Action)=>transition(s,{id:`event-${++seq}`,at:"2026-09-29T00:00:00Z",action});
test("door refusal never triggers storm or carry, closing requires an open door",()=>{
 let s=initialState();assert.equal(act(s,{type:"decision",slot:"close",yes:true}),s);
 s=act(s,{type:"decision",slot:"open",yes:false});assert.equal(s.choices.close,null);
 assert.equal(act(s,{type:"decision",slot:"television",yes:true}),s);
 s=act(s,{type:"decision",slot:"open",yes:true});s=act(s,{type:"decision",slot:"close",yes:false});
 assert.equal(s.choices.close,false);assert.equal(s.segment,"storm");
 s=act(s,{type:"decision",slot:"close",yes:true});assert.equal(s.choices.close,true);
 assert.equal(act(s,{type:"carry",yes:true}),s);
});
test("storm controls preserve independent refusals, retry and no implicit ending",()=>{
 let s=act(act(initialState(),{type:"decision",slot:"open",yes:true}),{type:"decision",slot:"close",yes:true});
 for(const slot of ["wait","curtain","window","television"] as const){
  s=act(s,{type:"decision",slot,yes:false});assert.equal(s.choices[slot],false);
  assert.equal(act(s,{type:"decision",slot,yes:false}),s);
  s=act(s,{type:"decision",slot,yes:true});assert.equal(s.choices[slot],true);
 }
 assert.equal(s.segment,"storm");assert.deepEqual(s.scoring,{status:"pending_configuration",contributions:null});
 assert.deepEqual(restore(serialize(s),"storm"),s);
});
test("all nine items confirm only one, draft switching does not confirm",()=>{
 for(const item of Object.keys(items) as Item[]){
  let s=initialState("carry");assert.equal(act(s,{type:"draft",item}),s);
  s=act(s,{type:"carry",yes:true});assert.equal(act(s,{type:"confirm"}),s);
  s=act(s,{type:"draft",item:"scarf"});s=act(s,{type:"draft",item});
  assert.equal(s.item,null);assert.equal(s.events.filter(e=>e.action.type==="carry").length,1);
  s=act(s,{type:"confirm"});assert.equal(s.item,item);
  assert.equal(act(s,{type:"confirm"}),s);assert.equal(act(s,{type:"draft",item:"key"}),s);
  assert.equal(act(s,{type:"carry",yes:false}),s);assert.deepEqual(restore(serialize(s),"carry"),s);
 }
});
test("no carry ends local choice, cannot add items afterwards",()=>{
 const s=act(initialState("carry"),{type:"carry",yes:false});
 assert.equal(s.item,null);assert.equal(act(s,{type:"draft",item:"key"}),s);assert.equal(act(s,{type:"carry",yes:true}),s);
});
test("duplicate ids are ignored and corrupt or cross-segment saves rejected",()=>{
 const e={id:"same",at:"2026-09-29T00:00:00Z",action:{type:"decision",slot:"open",yes:true}} as const;
 const s=transition(initialState(),e);assert.equal(transition(s,e),s);
 assert.throws(()=>restore(serialize(s),"carry"));assert.throws(()=>restore("broken","storm"));
 const base=JSON.parse(serialize(s));
 for(const events of [[e,e],[{...e,action:{type:"draft",item:"unknown"}}],[{...e,at:"invalid"}],[{...e,action:{type:"decision",slot:"__proto__",yes:true}}]])assert.throws(()=>restore(JSON.stringify({...base,events}),"storm"));
});
test("full event log blocks mutation explicitly",()=>{
 let s=act(initialState("carry"),{type:"carry",yes:true});
 while(s.events.length<MAX_EVENTS)s=act(s,{type:"draft",item:s.draft==="key"?"scarf":"key"});
 assert.equal(act(s,{type:"confirm"}),s);assert.deepEqual(restore(serialize(s),"carry"),s);
});

test("repeated refusals remain acknowledgeable without exhausting the log or duplicating score events",()=>{
 let s=initialState();
 for(const slot of ["open","close","wait","curtain","window","television"] as const){
  const no={type:"decision",slot,yes:false} as const;
  assert.equal(isRepeatedDecision(s,no),false);
  s=act(s,no);const raw=serialize(s);
  for(let i=0;i<MAX_EVENTS+1;i++){assert.equal(isRepeatedDecision(s,no),true);assert.equal(act(s,no),s);}
  s=restore(raw,"storm");assert.equal(isRepeatedDecision(s,no),true);
  s=act(s,{...no,yes:true});assert.equal(s.events.filter(e=>e.action.type==="decision"&&e.action.slot===slot).length,2);
  assert.equal(isRepeatedDecision(s,no),false);
 }
 assert.equal(s.events.length,12);assert.equal(s.scoring.contributions,null);
 assert.equal(isRepeatedDecision(initialState(),{type:"decision",slot:"television",yes:false}),false);
});

test("all 64 yes/no combinations complete only after six explicit answers",()=>{
 const slots=["open","close","wait","curtain","window","television"] as const;
 for(let mask=0;mask<64;mask++){
  let s=initialState();
  for(let i=0;i<slots.length;i++){assert.equal(stormComplete(s),false);s=act(s,{type:"decision",slot:slots[i],yes:!!(mask&(1<<i))});}
  assert.equal(stormComplete(s),true);assert.equal(s.events.length,6);assert.equal(stormComplete(restore(serialize(s),"storm")),true);assert.equal(s.scoring.contributions,null);
 }
 assert.equal(stormComplete(initialState("carry")),false);
});
