"""Read once per process; bind the complete validated bundle to new journeys."""
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from math import isfinite
from pathlib import Path
from .scoring_weights import load_weights
from .l2_scoring import load_policy
from .score_rules import GROUP_OPTIONS

CONFIG_PATH = Path(__file__).parent / "config" / "event-scores.json"
AXES = ("A", "V", "T", "F")
DEFINITION_VERSION = "server-composite-v1"


@lru_cache(maxsize=1)
def published_policy():
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or data.get("event_definition_version") != DEFINITION_VERSION:
        raise ValueError("INVALID_SCORE_DEFINITION_VERSION")
    if not data.get("event_score_version") or not isinstance(data.get("groups"), dict):
        raise ValueError("INVALID_SCORE_POLICY")
    if set(data["groups"]) != set(GROUP_OPTIONS):
        raise ValueError("SCORE_GROUP_SET_MISMATCH")
    for group, options in data["groups"].items():
        if not group.startswith(("l1.", "l2.", "l3.", "l4.")) or not isinstance(options, dict) or not options:
            raise ValueError("INVALID_SCORE_GROUP")
        if set(options) != GROUP_OPTIONS[group]: raise ValueError("SCORE_OPTION_SET_MISMATCH")
        for option in options.values():
            status, vector = option.get("status"), option.get("vector")
            if status not in ("configured", "unconfigured", "not_measured"):
                raise ValueError("INVALID_SCORE_STATUS")
            if status == "unconfigured":
                if vector is not None: raise ValueError("UNCONFIGURED_VECTOR_MUST_BE_NULL")
                continue
            if not isinstance(vector, dict) or set(vector) != set(AXES):
                raise ValueError("INVALID_SCORE_VECTOR")
            if any(v is not None and (type(v) not in (int, float) or not isfinite(v)) for v in vector.values()):
                raise ValueError("INVALID_SCORE_VALUE")
            if status == "not_measured" and any(v is not None for v in vector.values()):
                raise ValueError("NOT_MEASURED_REQUIRES_NULL")
    return dict(data, **load_weights(), normalization_version="avtf-minmax-v2", quartile_policy=load_policy())


def bundle():
    policy = deepcopy(published_policy())
    digest = hashlib.sha256(json.dumps(policy, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    return policy, digest
