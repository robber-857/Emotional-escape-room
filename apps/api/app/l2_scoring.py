"""Versioned pool quartiles for L2-04 only; no guessed production thresholds."""
from bisect import bisect_left
from copy import deepcopy
import json
from math import isfinite
from pathlib import Path
from .l2_metrics import METRIC_VERSION

CONFIG_PATH = Path(__file__).parent / "config" / "l2-04-quartiles.json"
DIMENSIONS = {"wallWindowProximity": "A", "tidiness": "F", "adjustmentCount": "T"}


def metric_band(placement, metric, policy):
    if metric == 'tidiness' and placement.get('ruleVersion') in ('l2-metrics-overlap-groups-v3', 'l2-metrics-full-footprint-v4', METRIC_VERSION):
        return placement['metrics']['tidinessBand']
    # Saved confirmations from older metric versions retain their original rule.
    return 1+bisect_left(policy['thresholds'][metric], placement['metrics'][metric])


def load_policy():
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(config, dict) or config.get("schema_version") != 1:
        raise ValueError("INVALID_POLICY_SCHEMA")
    active = config.get("active_version")
    if active is None:
        return None
    policy = config["versions"][active]
    if not isinstance(active, str) or not isinstance(policy, dict) or policy.get("metric_version") != METRIC_VERSION:
        raise ValueError("METRIC_VERSION_MISMATCH")
    pool = policy.get("pool")
    if policy.get('boundary_source') == 'user_fixed':
        cap=policy.get('adjustment_count_cap')
        if type(cap) not in (int,float) or not isfinite(cap) or cap<=0:
            raise ValueError('INVALID_ADJUSTMENT_CAP')
        if policy['thresholds']['adjustmentCount'] != [cap*.25,cap*.5,cap*.75]:
            raise ValueError('ADJUSTMENT_THRESHOLDS_MUST_MATCH_CAP')
    elif (not isinstance(pool, dict) or not isinstance(pool.get("id"), str) or not pool["id"]
            or not isinstance(pool.get("version"), str) or not pool["version"]
            or type(pool.get("sample_size")) is not int or type(pool.get("minimum_sample_size")) is not int
            or not 0 < pool["minimum_sample_size"] <= pool["sample_size"]):
        raise ValueError("INVALID_POOL")
    if policy.get("tie_policy") != "equal_to_lower_raw_bucket":
        raise ValueError("INVALID_TIE_POLICY")
    if not isinstance(policy["thresholds"], dict) or set(policy["thresholds"]) != set(DIMENSIONS):
        raise ValueError("INVALID_METRIC_THRESHOLDS")
    for name, cuts in policy["thresholds"].items():
        if (not isinstance(cuts, list) or len(cuts) != 3
                or any(type(v) not in (int, float) or not isfinite(v) or v < 0 for v in cuts)
                or cuts != sorted(cuts) or (name != "adjustmentCount" and cuts[-1] > 1)):
            raise ValueError("INVALID_QUARTILE_THRESHOLDS")
    return dict(deepcopy(policy), version=active)


def evaluate(placement):
    result = dict(status="pending_configuration", policy_version=None, contributions=None,
                  facts=dict(placement=deepcopy(placement)), scope="L2-04")
    if not placement["eligible"]:
        return dict(result, status="insufficient_evidence", reasons=placement["reasons"])
    try:
        policy = load_policy()
    except (OSError, ValueError, KeyError, TypeError):
        return dict(result, reasons=["INVALID_QUARTILE_CONFIGURATION"])
    if policy is None:
        return dict(result, reasons=["QUARTILE_POOL_NOT_CONFIGURED"])
    contributions = dict(A=None, V=None, T=None, F=None)
    quartiles = {}
    for metric, dimension in DIMENSIONS.items():
        bucket = metric_band(placement, metric, policy)-1
        quartiles[metric] = bucket+1
        contributions[dimension] = ((2, 1, -1, -2) if dimension == "T" else (-2, -1, 1, 2))[bucket]
    return dict(result, status="scored", policy_version=policy["version"], contributions=contributions,
                quartiles=quartiles, policy=policy)
