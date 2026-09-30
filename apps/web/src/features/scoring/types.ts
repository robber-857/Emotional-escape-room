export type Axis="A"|"V"|"T"|"F";
export type Vector=Record<Axis,number|null>;
export type AxisScore={raw:number|null;lower:number;upper:number;provisional:number|null;normalized:number|null;status:string;measured_groups:number;pending_groups:string[]};
export type LevelScore={level:string;complete:boolean;weight:number;axes:Record<Axis,AxisScore>;pending_groups:string[];pending_details:Record<string,string[]>;ledger_count:number};
export type ScoreEvent={group_id:string;option_id:string;label?:string;status:string;reason:string;vector:Vector|null;source_action_ids?:string[]};
export type ScoreAction={action_id:string;level:string;accepted:boolean;code:string;action:{type:string;choice?:string;slot?:string};reason:string;delta:Vector;events:ScoreEvent[];version:number;level_score:LevelScore};
export type Metric={axis:Axis;score:number;stars:number};
export type ScoreSummary={source:"server_database";session_id:string;status:string;evaluation_id?:string;policy_hash?:string;event_score_version?:string;normalization_version?:string;weight_version?:string;levels:Record<string,LevelScore>;ledger:ScoreEvent[];actions:ScoreAction[];final:{status:string;vector:Vector;axes:Record<Axis,{score:number|null;status:string;weight_sum:number;effective_weights:Record<string,number>}>;metrics:{authenticity:Metric|null;love:Metric|null}}|null};
