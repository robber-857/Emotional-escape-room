export type Metric={score:number;stars:number};
import type {ScoreSummary} from '../scoring/types';
export type FinalResult={reason?:string;score_summary?:ScoreSummary;session_id:string;source:'server_database';schema_version:'result-v1';status:'ready'|'pending_configuration';policy_version:string|null;portrait_id:string|null;vector:Record<'A'|'V'|'T'|'F',number|null>|null;metrics:{authenticity:Metric|null;love:Metric|null}|null};
