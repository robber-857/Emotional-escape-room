export type Axis="A"|"V"|"T"|"F";
export type Vector=Record<Axis,number|null>;
export type Total={raw:number|null;lower:number;upper:number;provisional:number|null;normalized:number|null;status:string};
export type LevelScore={level:string;complete:boolean;weight:number;total:Total;axes:Record<Axis,Total&{measured_groups:number}>;pending_groups:string[];ledger_count:number};
export type ScoreEvent={group_id:string;option_id:string;label?:string;status:string;reason:string;vector:Vector|null;source_action_ids?:string[]};
export type ScoreAction={action_id:string;level:string;accepted:boolean;code:string;action:{type:string;choice?:string;slot?:string};reason:string;delta:Vector;raw_total_delta:number|null;events:ScoreEvent[];version:number;level_score:LevelScore};
export type ScoreSummary={source:"server_database";session_id:string;status:string;evaluation_id?:string;policy_hash?:string;event_score_version?:string;normalization_version?:string;weight_version?:string;levels:Record<string,LevelScore>;ledger:ScoreEvent[];actions:ScoreAction[];final:{status:string;score:number|null;known_contribution:number}|null};
