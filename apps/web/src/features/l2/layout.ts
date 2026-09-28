export const furnitureIds=["armchair","chair","sofa","table-chair"] as const;
export type FurnitureId=typeof furnitureIds[number];
export type Point={u:number;v:number};
export type Layout=Record<FurnitureId,Point>;
export const layoutRuleVersion="l2-placement-v2";
// Calibrated trapezoid ground plane; parameters are prototype values, not scoring policy.
export const project=({u,v}:Point)=>({x:960+(u-.5)*(1100+820*v),y:760+270*v});
export const unproject=(x:number,y:number):Point=>{const v=(y-760)/270;return {u:.5+(x-960)/(1100+820*v),v};};
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
export const placementRules={maxOverlapRatio:.20,movementDistance:.02,minClearance:.025,clearanceFactor:.30,minOpenSides:3};
const area=(r:Rect)=>(r.right-r.left)*(r.bottom-r.top);
const intersection=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
export const overlapRatio=(a:Rect,b:Rect)=>intersection(a,b)/Math.min(area(a),area(b));
const overlap=(a:Rect,b:Rect)=>overlapRatio(a,b)>placementRules.maxOverlapRatio+1e-9;
export function validLayout(layout:Layout){
 if(!layout||furnitureIds.some(id=>!layout[id]||!Number.isFinite(layout[id].u)||!Number.isFinite(layout[id].v)))return false;
 const boxes=furnitureIds.map(id=>footprint(id,layout[id]));
 return boxes.every((b,i)=>b.left>=0&&b.right<=1&&b.top>=0&&b.bottom<=1&&!fixed.some(f=>overlap(b,f))&&!boxes.slice(i+1).some(c=>overlap(b,c)));
}
export function moveLayout(layout:Layout,id:FurnitureId,p:Point):Layout|null{
 if(!furnitureIds.includes(id)||!Number.isFinite(p.u)||!Number.isFinite(p.v))return null;
 const halfW=furniture[id].w/2,halfD=furniture[id].d/2;
 // Snap only small boundary errors; do not teleport a piece dragged onto a wall.
 const clamp=(n:number,min:number,max:number)=>n>=min-.015&&n<=max+.015?Math.max(min,Math.min(max,n)):n;
 const next={...layout,[id]:{u:clamp(p.u,halfW,1-halfW),v:clamp(p.v,halfD,1-halfD)}};
 return validLayout(next)?next:null;
}
export function transformFurniture(id:FurnitureId,p:Point){const at=project(p),base=furniture[id].anchor;const scale=(.78+.25*p.v)/(.78+.25*unproject(base.x,base.y).v);return `translate(${at.x} ${at.y}) scale(${scale}) translate(${-base.x} ${-base.y})`;}
// "Open placement" evaluates the moved object's destination, never remaining room area.
export function classifyLayout(layout:Layout,baseline:Layout=initialLayout(),already={tidy:false,openPlacement:false}){
 const reasonable=validLayout(layout);
 const movedIds=furnitureIds.filter(id=>Math.hypot(layout[id].u-baseline[id].u,layout[id].v-baseline[id].v)>=placementRules.movementDistance);
 const placements=movedIds.map(id=>{
  const b=footprint(id,layout[id]),others=furnitureIds.filter(other=>other!==id).map(other=>footprint(other,layout[other]));
  const requiredClearance=Math.max(placementRules.minClearance,Math.min(furniture[id].w,furniture[id].d)*placementRules.clearanceFactor);
  const nearestGap=Math.min(...others.map(o=>Math.hypot(Math.max(o.left-b.right,b.left-o.right,0),Math.max(o.top-b.bottom,b.top-o.bottom,0))));
  const g=requiredClearance*2;
  const sides:Rect[]=[{...b,left:b.left-g,right:b.left},{...b,left:b.right,right:b.right+g},{...b,top:b.top-g,bottom:b.top},{...b,top:b.bottom,bottom:b.bottom+g}];
  const openSides=sides.filter(r=>r.left>=0&&r.right<=1&&r.top>=0&&r.bottom<=1&&!others.some(o=>intersection(r,o)>1e-9)).length;
  return {id,from:baseline[id],to:layout[id],nearestGap,requiredClearance,openSides,open:reasonable&&nearestGap>=requiredClearance&&openSides>=placementRules.minOpenSides};
 });
 const tidy=reasonable&&movedIds.length>0,openPlacement=reasonable&&placements.some(p=>p.open);
 const events: ("tidy"|"open-placement")[]=[];
 if(tidy&&!already.tidy)events.push("tidy");if(openPlacement&&!already.openPlacement)events.push("open-placement");
 return {reasonable,tidy,openPlacement,movedIds,placements,events,ruleVersion:layoutRuleVersion};
}
