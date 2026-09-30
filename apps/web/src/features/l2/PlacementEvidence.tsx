import {ProximityDetails} from "./ProximityDetails";
import type {Receipt} from "./api";
import type {measureLayout} from "./metrics";

export function PlacementEvidence({scoring}:{scoring:Receipt["scoring"]}){
 const placement=scoring?.facts?.placement as ReturnType<typeof measureLayout>|undefined;
 if(!placement?.metrics)return null; // Historical receipts are not reinterpreted.
 const m=placement.metrics;
 const scores=scoring?.contributions as Record<string,number|null>|null;
 return <div aria-label="整理房间指标">
  <p>靠墙／窗程度：{m.wallWindowProximity.toFixed(3)}；整齐度：{m.tidiness.toFixed(3)}；有效调整：{m.adjustmentCount??"历史数据缺失"} 次。</p>
  <p>整齐度越高表示判定区域重叠越少；桌椅组合使用缩窄区域，不检查旋转。</p>
  <p>{scoring?.status==="scored"&&scores?`本幕贡献：A ${scores.A} / F ${scores.F} / T ${scores.T}；V 不计分。`:
   scoring?.status==="awaiting_l3_entry"?"本次确认已保存，将在进入第三幕时按最后一次确认结算；可以继续整理并重新确认。":
   scoring?.status==="already_assessed"?"首次确认已保存评分依据，本次不重复计分。":
   scoring?.status==="insufficient_evidence"?"本次布局越出地面范围或缺少历史调整记录，暂不计分。":"该回执未绑定有效分档配置，仅保存原始指标；新旅程已使用固定边界。"}</p>
 <ProximityDetails rows={placement.evidence?.wallProximityByObject}/>
 </div>;
}
