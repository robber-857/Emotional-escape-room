import test from "node:test";
import assert from "node:assert/strict";
import {overlapGroups,measureLayout} from "./metrics";
import {initialLayout} from "./layout";
const box=(x:number)=>({left:x,right:x+1,top:0,bottom:1});
import cases from "../../../../../content/l2-overlap-regression.json";
import {footprint,type Layout} from "./layout";
test("reported scene has two visible pairs although all floor patches are separate",()=>{
 const layout=cases.reported.layout as Layout;
 assert.equal(overlapGroups(Object.fromEntries(Object.entries(layout).map(([id,p])=>[id,footprint(id as keyof Layout,p)]))).pairs.length,0);
 assert.deepEqual(measureLayout(layout,1).evidence.overlapGroups.pairs,cases.reported.groups.pairs);
});
for(const [name,c] of Object.entries(cases))test(`scene regression ${name}`,()=>{
 const g=measureLayout(c.layout as Layout,1).evidence.overlapGroups;
 assert.equal(g.band,c.groups.band);
 for(const key of ["pairs","triples","quadruples"] as const)assert.deepEqual(g[key].map(ids=>ids.join(",")).sort(),c.groups[key].map(ids=>ids.join(",")).sort());
});
test("all six pairs, four triples and the quadruple",()=>{
 const ids=["A","B","C","D"];
 for(let mask=1;mask<16;mask++){
  const chosen=ids.filter((_,i)=>mask&(1<<i));if(chosen.length<2)continue;
  const result=overlapGroups(Object.fromEntries(ids.map((id,i)=>[id,box(chosen.includes(id)?0:10+i*2)])));
  assert.equal(result.band,chosen.length===2?3:1);
  assert.equal(result.pairs.length,chosen.length*(chosen.length-1)/2);
  assert.equal(result.triples.length,chosen.length===4?4:chosen.length===3?1:0);
  assert.equal(result.quadruples.length,chosen.length===4?1:0);
 }
});
test("chains, separate pairs, edge contact and tiny positive overlap",()=>{
 for(const [positions,band,pairs] of [
  [[0,2,4,6],4,0],[[0,1,2,3],4,0],[[0,.9,1.8,5],2,2],
  [[0,.9,4,4.9],2,2],[[0,.9,1.8,2.7],2,3],[[0,.999,4,6],3,1],
 ] as const){
  const result=overlapGroups(Object.fromEntries(positions.map((x,i)=>[String(i),box(x)])));
  assert.equal(result.band,band);assert.equal(result.pairs.length,pairs);assert.equal(result.triples.length,0);
 }
 const vertical=Object.fromEntries([0,1,2,3].map(i=>[String(i),{left:0,right:1,top:i,bottom:i+1}]));
 assert.equal(overlapGroups(vertical).band,4);
});
test("preview metrics include authoritative rule version and band",()=>{
 const layout=initialLayout();assert.equal(measureLayout(layout,0).metrics.tidinessBand,1);
 const stacked=Object.fromEntries(Object.keys(layout).map(k=>[k,{u:.5,v:.5}])) as typeof layout;
 const result=measureLayout(stacked,4);
 assert.equal(result.metrics.tidinessBand,1);assert.equal(result.evidence.overlapGroups.triples.length,4);
 assert.equal(result.ruleVersion,"l2-metrics-scene-alpha-v5");
});
