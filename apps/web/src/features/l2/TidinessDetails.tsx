export type OverlapGroups={pairs:string[][];triples:string[][];quadruples:string[][];band:number;method?:string};
const names:Record<string,string>={armchair:"单人沙发",chair:"窗边椅",sofa:"双人沙发","table-chair":"桌椅组合"};
export function TidinessDetails({groups}:{groups?:OverlapGroups}){
 if(!groups)return null;
 const labels=(rows:string[][])=>rows.map(ids=>ids.map(id=>names[id]||id).join("＋")).join("；")||"无";
 return <details><summary>整齐度计算明细：第 {groups.band}/4 档</summary>
  <p>两两重叠 {groups.pairs.length} 对：{labels(groups.pairs)}。</p>
  <p>三重叠：{labels(groups.triples)}；四重叠：{labels(groups.quadruples)}。</p>
  <p>存在三重或四重叠为第 1 档；至少两对重叠且无三重叠为第 2 档；仅一对为第 3 档；无重叠为第 4 档。</p>
  <p>{groups.method==="scene-alpha-strips-v1"?"按本次确认时家具图片的不透明轮廓计算，随移动和缩放变化；排除透明空白及阴影，轮廓采样精度为场景原尺寸 4 像素。":"历史记录：按当时的地面占位区域计算，画面遮挡可能未计入。"}边缘接触不计，记录不随当前画面变化。</p>
 </details>;
}
