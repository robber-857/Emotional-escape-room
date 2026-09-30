import {describeProximity,proximityMethod} from "./proximity";
import {furnitureIds,footprint,overlapFootprint,overlapRatio,insideFloor,type Layout} from "./layout";

export const metricVersion="l2-metrics-proximity-v2";
export const countVersion="l2-adjustments-v1";
export const movementTolerance=.002;

// Preview mirror only. Formal evidence and quartiles come from server receipts.
export function measureLayout(layout:Layout,adjustmentCount:number|null){
 const boxes=Object.fromEntries(furnitureIds.map(id=>[id,footprint(id,layout[id])])) as Record<typeof furnitureIds[number],ReturnType<typeof footprint>>;
 const cores=Object.fromEntries(furnitureIds.map(id=>[id,overlapFootprint(id,layout[id])])) as typeof boxes;
 const overlapPairs=furnitureIds.flatMap((a,i)=>furnitureIds.slice(i+1).map(b=>({ids:[a,b],ratio:overlapRatio(cores[a],cores[b])})));
 const maxOverlapByObject=Object.fromEntries(furnitureIds.map(id=>[id,Math.max(...overlapPairs.filter(p=>p.ids.includes(id)).map(p=>p.ratio))]));
 const wallProximityByObject=Object.fromEntries(furnitureIds.map(id=>[id,describeProximity(id,boxes[id])]));
 const wallDistances=Object.fromEntries(Object.entries(wallProximityByObject).map(([id,p])=>[id,p.distance]));
 const outsideFloor=furnitureIds.filter(id=>!insideFloor(boxes[id]));
 return {ruleVersion:metricVersion,countVersion,metrics:{wallWindowProximity:Object.values(wallProximityByObject).reduce((n,p)=>n+p.proximity,0)/furnitureIds.length,
  tidiness:1-Object.values(maxOverlapByObject).reduce((n,v)=>n+v,0)/furnitureIds.length,adjustmentCount},
  evidence:{overlapPairs,maxOverlapByObject,wallDistances,overlapCores:cores,objectCount:furnitureIds.length,outsideFloor,proximityMethod,wallProximityByObject},
  eligible:outsideFloor.length===0&&adjustmentCount!==null,reasons:[...(outsideFloor.length?["OUTSIDE_FLOOR"]:[]),...(adjustmentCount===null?["LEGACY_ADJUSTMENT_HISTORY_MISSING"]:[])]};
}
