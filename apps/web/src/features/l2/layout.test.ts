import test from "node:test";
import assert from "node:assert/strict";
import {initialLayout,validLayout,moveLayout,project,unproject,footprint,overlapFootprint} from "./layout";
import {measureLayout} from "./metrics";
import {initialState,transition,restore,type Action,type State} from "./model";
let n=0;
const act=(s:State,action:Action)=>transition(s,{id:`layout-${++n}`,at:"2026-09-30T00:00:00Z",action});
test("overlap is continuous, with no rotation or spacing classifier",()=>{
 const l=initialLayout();assert.equal(measureLayout(l,0).metrics.tidiness,1);
 const values=[.19,.15,.10,0].map(offset=>measureLayout({...l,chair:{u:l.sofa.u-offset,v:l.sofa.v}},1).metrics.tidiness);
 assert.deepEqual(values,[...values].sort((a,b)=>b-a));assert.ok(values[0]>values[3]);
 const stacked=Object.fromEntries(Object.keys(l).map(k=>[k,{u:.5,v:.5}])) as typeof l;
 assert.equal(measureLayout(stacked,4).metrics.tidiness,0);
});
test("table chair has a narrower overlap core and unchanged floor extent",()=>{
 const l=initialLayout(),full=footprint("table-chair",l["table-chair"]),core=overlapFootprint("table-chair",l["table-chair"]);
 assert.ok(core.right-core.left<full.right-full.left);assert.equal(core.top,full.top);assert.equal(core.bottom,full.bottom);
 const edge=measureLayout({...l,"table-chair":{u:l.sofa.u-.29,v:l.sofa.v}},1);
 assert.ok(Math.abs(edge.metrics.tidiness-(1-.01/.29/2))<1e-9);
});
test("invalid floor confirmation remains editable and does not lock scoring",()=>{
 const l=initialLayout(),px=1.4*96/2.54;
 for(const [gap,inside] of [[px-.1,true],[px,true],[px+.1,false],[180,false]] as const){
  let s=act(initialState(),{type:"layout-start"});const point={u:.45,v:.13/2-gap/270};
  s=act(s,{type:"layout-move",id:"chair",point});s=act(s,{type:"layout-confirm"});
  if(!inside){assert.equal(s.furniture.editing,true);assert.equal(s.exitDoorOpen,false);assert.equal(s.furniture.confirmed,null);continue;}
  assert.equal(s.furniture.classification?.eligible,true);assert.equal(s.furniture.classification?.metrics.tidiness,1);
  assert.equal(s.exitDoorOpen,true);assert.deepEqual(s.furniture.confirmed?.chair,point);
 }
});
test("moves undo reset retry and reload preserve cumulative count",()=>{
 let s=act(initialState(),{type:"layout-start"});
 assert.equal(act(s,{type:"layout-reset"}),s);
 const tiny={...s.furniture.layout.chair,u:s.furniture.layout.chair.u+.0001};assert.equal(act(s,{type:"layout-move",id:"chair",point:tiny}),s);
 const e={id:"dedup",at:"2026-09-30T00:00:00Z",action:{type:"layout-move",id:"chair",point:{u:.45,v:.35}} as Action};
 s=transition(s,e);assert.equal(transition(s,e),s);assert.equal(s.furniture.adjustmentCount,1);
 s=act(s,{type:"layout-undo"});s=act(s,{type:"layout-move",id:"chair",point:{u:.45,v:.35}});s=act(s,{type:"layout-reset"});
 assert.equal(s.furniture.adjustmentCount,4);s=act(s,{type:"layout-confirm"});
 assert.equal(s.furniture.classification?.metrics.adjustmentCount,4);
 assert.deepEqual(restore(JSON.stringify({version:1,events:s.events})),s);
});
test("draft does not unlock exit; confirmation does even without any movement",()=>{
 let s=act(initialState(),{type:"layout-start"});assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"layout-confirm"});assert.equal(s.exitDoorOpen,true);assert.equal(s.furniture.classification?.metrics.adjustmentCount,0);
 assert.equal(act(s,{type:"layout-confirm"}),s);
 s=act(s,{type:"layout-start"});s=act(s,{type:"layout-move",id:"chair",point:{u:.45,v:.35}});
 assert.equal(s.furniture.confirmed,null);s=act(s,{type:"layout-exit"});assert.equal(s.exitDoorOpen,true);
});
test("default geometry and free projection retain exact coordinates",()=>{
 assert.equal(validLayout(initialLayout()),true);
 for(const y of [0,200,397.8,500,760,1049]){const p=unproject(100,y);assert.ok(Number.isFinite(p.u));assert.ok(Math.abs(project(p).x-100)<1e-8);assert.ok(Math.abs(project(p).y-y)<1e-8);}
 assert.equal(moveLayout(initialLayout(),"chair",{u:NaN,v:0}),null);
 let s=act(initialState(),{type:"layout-start"});const l=s.furniture.layout;
 s=act(s,{type:"layout-move",id:"chair",point:{u:.4,v:-2.5}});s=act(s,{type:"layout-undo"});assert.deepEqual(s.furniture.layout,l);
});
test("missing legacy count never becomes zero",()=>{const result=measureLayout(initialLayout(),null);assert.equal(result.eligible,false);assert.equal(result.metrics.adjustmentCount,null);});
