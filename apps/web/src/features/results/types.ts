export type Metric={score:number;stars:number};
export type FinalResult={session_id:string;source:'server_database';schema_version:'result-v1';status:'ready'|'pending_configuration';policy_version:string|null;portrait_id:string|null;vector:Record<'A'|'V'|'T'|'F',number>|null;metrics:{authenticity:Metric;love:Metric}|null};
