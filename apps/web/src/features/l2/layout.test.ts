import {proximityCalibration,describeProximity} from "./proximity";
import test from "node:test";
import assert from "node:assert/strict";
import {initialLayout,validLayout,moveLayout,project,unproject,footprint,overlapFootprint,constrainPoint} from "./layout";
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
test("wall bounds constrain drag before confirmation",()=>{
 const l=initialLayout(),px=1.4*96/2.54;
 for(const [gap,inside] of [[px-.1,true],[px,true],[px+.1,false],[180,false]] as const){
  let s=act(initialState(),{type:"layout-start"});const point={u:.45,v:.13/2-gap/270};
  s=act(s,{type:"layout-move",id:"chair",point});s=act(s,{type:"layout-confirm"});
  assert.equal(s.furniture.classification?.eligible,true);assert.equal(s.furniture.classification?.metrics.tidiness,1);
  assert.equal(s.exitDoorOpen,true);assert.deepEqual(s.furniture.confirmed?.chair,constrainPoint("chair",point));
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

test("soft edge accepts reported armchair and pushing wall does not count again",()=>{
 const p={u:.27791321372763345,v:.9298451630714811};assert.deepEqual(constrainPoint("armchair",p),p);
 let s=act(initialState(),{type:"layout-start"});s=act(s,{type:"layout-move",id:"armchair",point:{u:4,v:4}});
 const count=s.furniture.adjustmentCount;const same=act(s,{type:"layout-move",id:"armchair",point:{u:4,v:4}});
 assert.equal(same,s);assert.equal(same.furniture.adjustmentCount,count);
 assert.equal(measureLayout(s.furniture.layout,count).eligible,true);
});

test("per-object proximity calibration agrees with server reference values",()=>{
 const expected={armchair:.42528822226408913,chair:.4798082619359234,sofa:.3687675528371376,"table-chair":.3414071269750786};
 for(const id of Object.keys(expected) as (keyof typeof expected)[]){const c=proximityCalibration(id);assert.ok(Math.abs(c.maxDistance-expected[id])<1e-10);assert.ok(describeProximity(id,footprint(id,c.point)).proximity<1e-10);for(const u of [-4,4])assert.equal(describeProximity(id,footprint(id,constrainPoint(id,{u,v:c.point.v}))).proximity,1);}
 const layout={armchair:{u:.48367458333431806,v:.5642826639987756},chair:{u:.3174398374902257,v:.5305600694496282},sofa:{u:.48945212433202495,v:.8808201911641543},"table-chair":{u:.5071925065937517,v:.41303218886014825}};
 const m=measureLayout(layout,0);assert.equal(m.metrics.tidiness,1);assert.ok(Math.abs(m.metrics.wallWindowProximity-.2365251214454691)<1e-10);
});
