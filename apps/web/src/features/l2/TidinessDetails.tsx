export type OverlapGroups={pairs:string[][];triples:string[][];quadruples:string[][];band:number};
const names:Record<string,string>={armchair:"单人沙发",chair:"窗边椅",sofa:"双人沙发","table-chair":"桌椅组合"};
export function TidinessDetails({groups}:{groups?:OverlapGroups}){
 if(!groups)return null;
 const labels=(rows:string[][])=>rows.map(ids=>ids.map(id=>names[id]||id).join("＋")).join("；")||"无";
 return <details><summary>整齐度计算明细：第 {groups.band}/4 档</summary>
  <p>两两重叠 {groups.pairs.length} 对：{labels(groups.pairs)}。</p>
  <p>三重叠：{labels(groups.triples)}；四重叠：{labels(groups.quadruples)}。</p>
  <p>存在三重或四重叠为第 1 档；至少两对重叠且无三重叠为第 2 档；仅一对为第 3 档；无重叠为第 4 档。</p>
  <p>按本条记录的家具判定区域计算共同相交面积，边缘接触不计。</p>
 </details>;
}
