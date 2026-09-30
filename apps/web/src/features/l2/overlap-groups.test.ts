import test from "node:test";
import assert from "node:assert/strict";
import {overlapGroups,measureLayout} from "./metrics";
import {initialLayout} from "./layout";
const box=(x:number)=>({left:x,right:x+1,top:0,bottom:1});
test("table chair outer strip overlaps armchair even outside the former narrow core",()=>{
 const layout={armchair:{u:.25,v:.5},"table-chair":{u:.52,v:.5},chair:{u:.8,v:.25},sofa:{u:.75,v:.85}};
 const result=measureLayout(layout,1);
 assert.equal(result.metrics.tidinessBand,3);
 assert.deepEqual(result.evidence.overlapGroups.pairs,[["armchair","table-chair"]]);
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
 const layout=initialLayout();assert.equal(measureLayout(layout,0).metrics.tidinessBand,4);
 const stacked=Object.fromEntries(Object.keys(layout).map(k=>[k,{u:.5,v:.5}])) as typeof layout;
 const result=measureLayout(stacked,4);
 assert.equal(result.metrics.tidinessBand,1);assert.equal(result.evidence.overlapGroups.triples.length,4);
 assert.equal(result.ruleVersion,"l2-metrics-full-footprint-v4");
});
