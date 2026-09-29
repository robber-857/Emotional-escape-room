import test from "node:test";import assert from "node:assert/strict";
import {initialLayout,validLayout,moveLayout,project,unproject,classifyLayout} from "./layout";
import {initialState,transition,restore,type Action,type State} from "./model";
test("confirmed movement unlocks exit independently of exploration and open-placement",()=>{
 let s=act(initialState(),{type:"layout-start"});s=act(s,{type:"layout-confirm"});assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"layout-start"});s=act(s,{type:"layout-move",id:"chair",point:{u:.45,v:.35}});s=act(s,{type:"layout-undo"});s=act(s,{type:"layout-confirm"});assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"layout-start"});const sofa=s.furniture.layout.sofa;s=act(s,{type:"layout-move",id:"chair",point:{u:sofa.u-(.31+.085)/2+.01,v:sofa.v}});assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"layout-confirm"});assert.equal(s.exitDoorOpen,true);assert.equal(s.furniture.classification?.openPlacement,false);assert.equal(s.search.status,"idle");
 s=act(s,{type:"layout-start"});s=act(s,{type:"layout-reset"});s=act(s,{type:"layout-exit"});assert.equal(s.exitDoorOpen,true);assert.deepEqual(restore(JSON.stringify({version:1,events:s.events})),s);
});
let n=0;const act=(s:State,action:Action)=>transition(s,{id:`layout-${++n}`,at:"2026-09-28T00:00:00Z",action});
test("default ground footprints are valid and projection round trips",()=>{const l=initialLayout();assert.equal(validLayout(l),true);for(const p of Object.values(l)){const q=project(p),r=unproject(q.x,q.y);assert.ok(Math.abs(p.u-r.u)<1e-9&&Math.abs(p.v-r.v)<1e-9);}});
test("confirmation snapshots layout; next movement invalidates old confirmation",()=>{let s=act(initialState(),{type:"layout-start"});s=act(s,{type:"layout-confirm"});assert.equal(s.furniture.editing,false);assert.deepEqual(s.furniture.confirmed,s.furniture.layout);assert.equal(s.furniture.classification?.reasonable,true);assert.equal(act(s,{type:"layout-confirm"}),s);s=act(s,{type:"layout-start"});s=act(s,{type:"layout-move",id:"chair",point:{u:.45,v:.35}});assert.equal(s.furniture.confirmed,null);s=act(s,{type:"layout-exit"});assert.equal(s.furniture.editing,false);assert.deepEqual(restore(JSON.stringify({version:1,events:s.events})),s);});
test("open placement classifier rejects invalid layouts and returns versioned prototype evidence",()=>{const l=initialLayout();assert.equal(classifyLayout({...l,chair:l.sofa}).reasonable,false);assert.equal(classifyLayout(l).ruleVersion,"l2-placement-v4");});

test("one moved piece in open destination triggers both events; unchanged layout triggers neither",()=>{const l=initialLayout();assert.deepEqual(classifyLayout(l,l).events,[]);const moved=moveLayout(l,"chair",{u:.45,v:.35})!;const c=classifyLayout(moved,l);assert.equal(c.tidy,true);assert.equal(c.openPlacement,true);assert.deepEqual(c.movedIds,["chair"]);assert.deepEqual(c.events,["tidy","open-placement"]);assert.deepEqual(classifyLayout(moved,l,{tidy:true,openPlacement:true}).events,[]);});
test("crowded but reasonable placement is tidy without open-placement",()=>{const l=initialLayout();const p={u:l.sofa.u-(.31+.085)/2+.01,v:l.sofa.v};const moved=moveLayout(l,"chair",p)!;assert.ok(moved);const c=classifyLayout(moved,l);assert.equal(c.tidy,true);assert.equal(c.openPlacement,false);});
test("confirmation deduplicates derived events and undo restores no-change semantics",()=>{let s=act(initialState(),{type:"layout-start"});s=act(s,{type:"layout-move",id:"chair",point:{u:.45,v:.35}});s=act(s,{type:"layout-undo"});s=act(s,{type:"layout-confirm"});assert.deepEqual(s.furniture.classification?.events,[]);s=act(s,{type:"layout-start"});s=act(s,{type:"layout-move",id:"chair",point:{u:.45,v:.35}});s=act(s,{type:"layout-confirm"});assert.equal(s.furniture.triggered.openPlacement,true);s=act(s,{type:"layout-start"});s=act(s,{type:"layout-confirm"});assert.deepEqual(s.furniture.classification?.events,[]);assert.deepEqual(restore(JSON.stringify({version:1,events:s.events})),s);});

test("free drops are retained, excessive suspension and overlap only fail classification",()=>{
 const l=initialLayout();for(const point of [{u:.45,v:-.5},l.sofa,{u:.1,v:.5},{u:.5,v:-2.5}]){const next=moveLayout(l,"chair",point)!;assert.deepEqual(next.chair,point);}
 assert.equal(moveLayout(l,"chair",{u:NaN,v:0}),null);
 for(const point of [{u:.45,v:-.5},l.sofa]){let s=act(initialState(),{type:"layout-start"});s=act(s,{type:"layout-move",id:"chair",point});s=act(s,{type:"layout-confirm"});assert.equal(s.exitDoorOpen,false);assert.equal(s.furniture.classification?.tidy,false);assert.deepEqual(s.furniture.confirmed?.chair,point);assert.deepEqual(restore(JSON.stringify({version:1,events:s.events})),s);}
});
test("1.4 cm suspension threshold includes the boundary and excludes larger gaps",()=>{
 const l=initialLayout(),px=1.4*96/2.54;
 for(const [gap,tidy] of [[px-.1,true],[px,true],[px+.1,false]] as const){const next=moveLayout(l,"chair",{u:.45,v:.13/2-gap/270})!;const c=classifyLayout(next,l);assert.equal(c.tidy,tidy);assert.ok(Math.abs(c.suspensionGapsPx.chair-gap)<1e-8);}
});
test("free placement projection has no singularity above floor; undo retains exact coordinates",()=>{
 for(const y of [0,200,397.8,500,760,1049]){const p=unproject(100,y);assert.ok(Number.isFinite(p.u));assert.ok(Math.abs(project(p).x-100)<1e-8);assert.ok(Math.abs(project(p).y-y)<1e-8);}
 let s=act(initialState(),{type:"layout-start"});const l=s.furniture.layout;s=act(s,{type:"layout-move",id:"chair",point:{u:.4,v:-2.5}});s=act(s,{type:"layout-undo"});assert.deepEqual(s.furniture.layout,l);
});
