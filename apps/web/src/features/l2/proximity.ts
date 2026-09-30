import {furniture,footprint,leftFloorEdge,rearContactEdge,frontMargin,type FurnitureId,type Rect,type Point} from './layout';
export const proximityMethod='reachable-nearest-wall-v2';
export const contactTolerance=.02;
export const nearestWallDistance=(b:Rect)=>Math.max(0,Math.min(b.top-rearContactEdge,b.left-Math.max(leftFloorEdge(b.top),leftFloorEdge(b.bottom)),1-b.right));
const cache=new Map<FurnitureId,{maxDistance:number;point:Point}>();
export function proximityCalibration(id:FurnitureId){
 const cached=cache.get(id);if(cached)return cached;
 const {d}=furniture[id];let low=rearContactEdge+d/2,high=1+frontMargin-d/2;
 const bestAt=(v:number)=>{const left=Math.max(leftFloorEdge(v-d/2),leftFloorEdge(v+d/2));const point={u:(left+1)/2,v};return {maxDistance:nearestWallDistance(footprint(id,point)),point};};
 for(let i=0;i<80;i++){const a=low+(high-low)/3,b=high-(high-low)/3;if(bestAt(a).maxDistance<bestAt(b).maxDistance)low=a;else high=b;}
 const value=bestAt((low+high)/2);if(value.maxDistance<=contactTolerance)throw Error('NO_PROXIMITY_RANGE');cache.set(id,value);return value;
}
export function describeProximity(id:FurnitureId,b:Rect){const distance=nearestWallDistance(b),{maxDistance}=proximityCalibration(id);return {distance,maxDistance,contactTolerance,proximity:1-Math.max(0,Math.min(1,(distance-contactTolerance)/(maxDistance-contactTolerance)))};}
