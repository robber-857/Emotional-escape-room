export const furnitureIds=["armchair","chair","sofa","table-chair"] as const;
export type FurnitureId=typeof furnitureIds[number];
export type Point={u:number;v:number};
export type Layout=Record<FurnitureId,Point>;
export const layoutRuleVersion="l2-placement-v5";
// Calibrated trapezoid ground plane; parameters are prototype values, not scoring policy.
export const project=({u,v}:Point)=>({x:960+(u-.5)*(1100+820*Math.max(0,v)),y:760+270*v});
export const unproject=(x:number,y:number):Point=>{const v=(y-760)/270;return {u:.5+(x-960)/(1100+820*Math.max(0,v)),v};};
export const furniture={
 armchair:{name:"单人沙发",anchor:{x:285,y:990},w:.19,d:.20},
 chair:{name:"窗边椅",anchor:{x:1145,y:810},w:.085,d:.13},
 "table-chair":{name:"桌椅组合",anchor:{x:1510,y:1013},w:.41,d:.10},
 sofa:{name:"双人沙发",anchor:{x:1510,y:925},w:.31,d:.23}
};
export const initialLayout=():Layout=>Object.fromEntries(furnitureIds.map(id=>[id,unproject(furniture[id].anchor.x,furniture[id].anchor.y)])) as Layout;
export type Rect={left:number;right:number;top:number;bottom:number};
export const fixed:Rect[]=[];
export const footprint=(id:FurnitureId,p:Point):Rect=>({left:p.u-furniture[id].w/2,right:p.u+furniture[id].w/2,top:p.v-furniture[id].d/2,bottom:p.v+furniture[id].d/2});
// Narrow only the table/chair overlap core; floor contact and clearance keep the full footprint.
export const overlapFootprint=(id:FurnitureId,p:Point):Rect=>id==="table-chair"?{...footprint(id,p),left:p.u-.29/2,right:p.u+.29/2}:footprint(id,p);
export const placementRules={maxOverlapRatio:.20,movementDistance:.02,minClearance:.025,clearanceFactor:.30,minOpenSides:3};
const area=(r:Rect)=>(r.right-r.left)*(r.bottom-r.top);
const intersection=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
export const overlapRatio=(a:Rect,b:Rect)=>intersection(a,b)/Math.min(area(a),area(b));
const overlap=(a:Rect,b:Rect)=>overlapRatio(a,b)>placementRules.maxOverlapRatio+1e-9;
// Keep the original projection/save coordinates. The visible left floor extends
// beyond u=0 in the middle depth, tapering back inside the canvas at the front.
export const leftFloorEdge=(v:number)=>Math.max(-.12*Math.max(0,Math.min(1,(v-.10)/.45)),.5+(35-960)/(1100+820*Math.max(0,v)));
export const suspensionToleranceCm=1.4;
export const suspensionTolerancePx=suspensionToleranceCm*96/2.54;
export const suspensionGapPx=(b:Rect)=>Math.max(0,-b.top*270);
export const insideFloor=(b:Rect)=>suspensionGapPx(b)<=suspensionTolerancePx+1e-9&&b.bottom<=1&&b.right<=1&&b.left>=Math.max(leftFloorEdge(b.top),leftFloorEdge(b.bottom))-1e-9;
export function validLayout(layout:Layout){
 if(!layout||furnitureIds.some(id=>!layout[id]||!Number.isFinite(layout[id].u)||!Number.isFinite(layout[id].v)))return false;
 const boxes=furnitureIds.map(id=>footprint(id,layout[id]));
 const overlapBoxes=furnitureIds.map(id=>overlapFootprint(id,layout[id]));
 return boxes.every((b,i)=>insideFloor(b)&&!fixed.some(f=>overlap(overlapBoxes[i],f))&&!overlapBoxes.slice(i+1).some(c=>overlap(overlapBoxes[i],c)));
}
export function moveLayout(layout:Layout,id:FurnitureId,p:Point):Layout|null{
 if(!furnitureIds.includes(id)||!Number.isFinite(p.u)||!Number.isFinite(p.v))return null;
 // Bounds protect malformed payloads, not furniture arrangement. Preserve the drop exactly.
 if(p.u < -4 || p.u > 4 || p.v < -4 || p.v > 4)return null;
 return {...layout,[id]:{...p}};
}
export function transformFurniture(id:FurnitureId,p:Point){const at=project(p),base=furniture[id].anchor;const scale=(.78+.25*Math.max(0,p.v))/(.78+.25*unproject(base.x,base.y).v);return `translate(${at.x} ${at.y}) scale(${scale}) translate(${-base.x} ${-base.y})`;}
