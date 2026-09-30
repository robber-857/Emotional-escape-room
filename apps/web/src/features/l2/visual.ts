import {furniture,project,unproject,type FurnitureId,type Point} from "./layout";
import masks from "../../../../api/app/config/l2-overlap-masks.json";
import {furnitureIds,type Layout} from "./layout";

type Row=[number,number,number[][]];
function sceneRows(id:FurnitureId,p:Point):Row[]{
 const base=furniture[id].anchor,at=project(p),scale=(.78+.25*Math.max(0,p.v))/(.78+.25*unproject(base.x,base.y).v);
 return (masks.pieces[id].rows as Row[]).map(([top,bottom,runs])=>[at.y+(top-base.y)*scale,at.y+(bottom-base.y)*scale,runs.map(([l,r])=>[at.x+(l-base.x)*scale,at.x+(r-base.x)*scale])]);
}
function intersectRows(a:Row[],b:Row[]):Row[]{
 const result:Row[]=[];let i=0,j=0;
 while(i<a.length&&j<b.length){
  const [at,ab,ar]=a[i],[bt,bb,br]=b[j],top=Math.max(at,bt),bottom=Math.min(ab,bb);
  if(bottom-top>1e-9){const runs=ar.flatMap(([al,ah])=>br.map(([bl,bh])=>[Math.max(al,bl),Math.min(ah,bh)]).filter(([l,r])=>r-l>1e-9));if(runs.length)result.push([top,bottom,runs]);}
  if(ab<=bb)i++;else j++;
 }
 return result;
}
export function visualGroups(layout:Layout){
 const rows=Object.fromEntries(furnitureIds.map(id=>[id,sceneRows(id,layout[id])])) as Record<FurnitureId,Row[]>;
 const groups:Record<number,string[][]>={2:[],3:[],4:[]};
 for(let mask=1;mask<16;mask++){
  const ids=furnitureIds.filter((_,i)=>mask&(1<<i));if(ids.length<2)continue;
  let common=rows[ids[0]];for(const id of ids.slice(1))common=intersectRows(common,rows[id]);
  if(common.length)groups[ids.length].push([...ids]);
 }
 for(const group of Object.values(groups))group.sort((a,b)=>a.join(",").localeCompare(b.join(",")));
 return {pairs:groups[2],triples:groups[3],quadruples:groups[4],band:groups[3].length||groups[4].length?1:groups[2].length>1?2:groups[2].length?3:4,method:masks.method};
}
