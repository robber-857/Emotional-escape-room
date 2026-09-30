"""Final result contract. Only server policies may supply evaluated values."""
import math
from pydantic import BaseModel, ConfigDict, Field

class Evaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_version: str = Field(min_length=1)
    portrait_id: str = Field(pattern=r"^(0[1-9]|1[0-6])$")
    vector: dict[str, float]
    authenticity: float = Field(ge=0, le=100, allow_inf_nan=False)
    love: float = Field(ge=0, le=100, allow_inf_nan=False)


def stars(score):
    # Exact user intervals: [0,20), [20,40), [40,60), [60,80), [80,100].
    if isinstance(score, bool) or not isinstance(score, (float, int)) or not math.isfinite(score) or not 0 <= score <= 100:
        raise ValueError("SCORE_OUT_OF_RANGE")
    return min(5, int(score // 20) + 1)


def build_result(sid, snapshots, score_summary=None, portrait_policy=None):
    base = dict(session_id=str(sid), source="server_database", schema_version="result-v1",
                input_versions={key: row["version"] for key, row in snapshots.items()},
                rating_policy_version="five-stars-v1")
    if score_summary is not None:
        from .portrait_policy import select_portrait
        final=score_summary.get('final') or {}
        if final.get('status')!='ready':
            return dict(base,status='pending_configuration',policy_version=None,portrait_id=None,
                        vector=final.get('vector'),metrics=final.get('metrics'),reason='SCORING_PENDING')
        vector=final['vector']
        portrait_id=select_portrait(vector,portrait_policy)
        if portrait_id is None:
            return dict(base,status='pending_configuration',policy_version=None,portrait_id=None,
                        vector=vector,metrics=final['metrics'],reason='PORTRAIT_MAPPING_PENDING')
        evaluation=dict(policy_version=portrait_policy['version'],portrait_id=portrait_id,vector=vector,
                        authenticity=vector['T'],love=vector['F'])
    else:
        evaluation = None
    if evaluation is None:
        return dict(base, status="pending_configuration", policy_version=None,
                    portrait_id=None, vector=None, metrics=None)
    value = Evaluation.model_validate(evaluation)
    if set(value.vector) != {"A", "V", "T", "F"} or not all(math.isfinite(v) for v in value.vector.values()):
        raise ValueError("INVALID_AVTF_VECTOR")
    return dict(base, status="ready", policy_version=value.policy_version,
                portrait_id=value.portrait_id, vector=value.vector,
                metrics={key:dict(score=score, stars=stars(score)) for key, score in
                         (("authenticity", value.authenticity), ("love", value.love))})

