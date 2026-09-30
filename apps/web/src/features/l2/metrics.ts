import {describeProximity,proximityMethod} from "./proximity";
import {furnitureIds,footprint,overlapFootprint,overlapRatio,insideFloor,type Layout,type Rect} from "./layout";

export const metricVersion="l2-metrics-overlap-groups-v3";
export const countVersion="l2-adjustments-v1";
export const movementTolerance=.002;

export function overlapGroups(cores:Record<string,Rect>){
 const ids=Object.keys(cores),groups:Record<number,string[][]>={2:[],3:[],4:[]};
 for(let mask=1;mask<(1<<ids.length);mask++){
  const group=ids.filter((_,i)=>mask&(1<<i));if(group.length<2)continue;
  const boxes=group.map(id=>cores[id]);
  if(Math.min(...boxes.map(b=>b.right))-Math.max(...boxes.map(b=>b.left))>1e-9&&Math.min(...boxes.map(b=>b.bottom))-Math.max(...boxes.map(b=>b.top))>1e-9)groups[group.length].push(group);
 }
 const band=groups[3].length||groups[4].length?1:groups[2].length>1?2:groups[2].length?3:4;
 return {pairs:groups[2],triples:groups[3],quadruples:groups[4],band};
}

// Preview mirror only. Formal evidence and quartiles come from server receipts.
export function measureLayout(layout:Layout,adjustmentCount:number|null){
 const boxes=Object.fromEntries(furnitureIds.map(id=>[id,footprint(id,layout[id])])) as Record<typeof furnitureIds[number],ReturnType<typeof footprint>>;
 const cores=Object.fromEntries(furnitureIds.map(id=>[id,overlapFootprint(id,layout[id])])) as typeof boxes;
 const groups=overlapGroups(cores);
 const overlapPairs=furnitureIds.flatMap((a,i)=>furnitureIds.slice(i+1).map(b=>({ids:[a,b],ratio:overlapRatio(cores[a],cores[b])})));
 const maxOverlapByObject=Object.fromEntries(furnitureIds.map(id=>[id,Math.max(...overlapPairs.filter(p=>p.ids.includes(id)).map(p=>p.ratio))]));
 const wallProximityByObject=Object.fromEntries(furnitureIds.map(id=>[id,describeProximity(id,boxes[id])]));
 const wallDistances=Object.fromEntries(Object.entries(wallProximityByObject).map(([id,p])=>[id,p.distance]));
 const outsideFloor=furnitureIds.filter(id=>!insideFloor(boxes[id]));
 // Keep the old continuous value only as diagnostic evidence; v3 scores the band.
 return {ruleVersion:metricVersion,countVersion,metrics:{wallWindowProximity:Object.values(wallProximityByObject).reduce((n,p)=>n+p.proximity,0)/furnitureIds.length,
  tidiness:1-Object.values(maxOverlapByObject).reduce((n,v)=>n+v,0)/furnitureIds.length,tidinessBand:groups.band,adjustmentCount},
  evidence:{overlapPairs,maxOverlapByObject,wallDistances,overlapCores:cores,overlapGroups:groups,objectCount:furnitureIds.length,outsideFloor,proximityMethod,wallProximityByObject},
  eligible:outsideFloor.length===0&&adjustmentCount!==null,reasons:[...(outsideFloor.length?["OUTSIDE_FLOOR"]:[]),...(adjustmentCount===null?["LEGACY_ADJUSTMENT_HISTORY_MISSING"]:[])]};
}
