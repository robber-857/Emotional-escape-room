export type ProximityRow={distance:number;maxDistance:number;contactTolerance:number;proximity:number};
export function ProximityDetails({rows}:{rows?:Record<string,ProximityRow>}){
 if(!rows)return null;
 const names:Record<string,string>={armchair:'单人沙发',chair:'窗边椅',sofa:'双人沙发','table-chair':'桌椅组合'};
 return <details><summary>靠墙程度计算明细</summary><p>每件家具：1 − clamp((d − P) / (Dmax − P), 0, 1)。下方距离使用统一地面坐标单位；前沿不算墙，窗户不额外加分。</p><table><thead><tr><th>家具</th><th>最近墙 d</th><th>最大距离 Dmax</th><th>贴墙容差 P</th><th>靠墙程度</th></tr></thead><tbody>{Object.entries(rows).map(([id,r])=><tr key={id}><td>{names[id]||id}</td><td>{r.distance.toFixed(3)}</td><td>{r.maxDistance.toFixed(3)}</td><td>{r.contactTolerance.toFixed(3)}</td><td>{r.proximity.toFixed(3)}</td></tr>)}</tbody></table><p>整体平均：{(Object.values(rows).reduce((s,r)=>s+r.proximity,0)/Object.keys(rows).length).toFixed(3)}</p></details>;
}
